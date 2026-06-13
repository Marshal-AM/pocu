from __future__ import annotations

import os
import time
import uuid
from typing import Any

from ap2.sdk.generated.open_payment_mandate import OpenPaymentMandate
from ap2.sdk.generated.payment_mandate import PaymentMandate
from ap2.sdk.generated.payment_receipt import PaymentReceipt
from ap2.sdk.generated.types.amount import Amount
from ap2.sdk.jwt_helper import create_jwt
from ap2.sdk.mandate import MandateClient
from ap2.sdk.utils import compute_sha256_b64url

from pocu_ap2.config import AGENT_ACCOUNT_ID, POCU_MERCHANT_WEBSITE, tinybars_to_hbar
from pocu_ap2.constraints_hedera import (
    HEDERA_AMOUNT_CURRENCY,
    check_hedera_payment_constraints,
    mandate_context_from_session,
)
from pocu_ap2.keys import get_agent_signing_key, get_trusted_surface_key
from pocu_ap2.mandates import hedera_payment_instrument, pocu_merchant


def execute_hbar_allowance_transfer(
    *,
    owner_account_id: str,
    agent_account_id: str,
    amount_tinybars: int,
    memo: str,
) -> str:
    if amount_tinybars <= 0:
        return ""

    from hiero_sdk_python import (
        AccountId,
        Client,
        Hbar,
        Network,
        PrivateKey,
        ResponseCode,
        TransferTransaction,
    )

    pk = (
        os.getenv("HEX_ENCODED_PRIVATE_KEY")
        or os.getenv("PRIVATE_KEY")
        or os.getenv("DER_ENCODED_PRIVATE_KEY", "")
    )
    operator_id = os.getenv("ACCOUNT_ID", agent_account_id)
    if not pk:
        raise RuntimeError(
            "Agent Hedera private key required for AP2 settlement "
            "(HEX_ENCODED_PRIVATE_KEY, PRIVATE_KEY, or DER_ENCODED_PRIVATE_KEY)"
        )

    if pk.startswith("0x"):
        private_key = PrivateKey.from_string_ecdsa(pk)
    else:
        private_key = PrivateKey.from_string(pk)

    client = Client(Network(network="testnet"))
    client.set_operator(AccountId.from_string(operator_id), private_key)

    tx = (
        TransferTransaction()
        .add_approved_hbar_transfer(
            AccountId.from_string(owner_account_id), Hbar.from_tinybars(-amount_tinybars)
        )
        .add_hbar_transfer(
            AccountId.from_string(agent_account_id), Hbar.from_tinybars(amount_tinybars)
        )
        .set_transaction_memo(memo[:100])
    )
    receipt = tx.execute(client)
    if receipt.status != ResponseCode.SUCCESS:
        status = getattr(ResponseCode(receipt.status), "name", str(receipt.status))
        raise RuntimeError(f"AP2 Hedera settlement failed: {status}")
    return str(tx.transaction_id)


def load_open_payment_mandate(session: dict[str, Any]) -> OpenPaymentMandate:
    trusted = get_trusted_surface_key()
    verified = MandateClient().verify(
        token=session["open_payment_sdjwt"],
        key_or_provider=trusted,
        payload_type=OpenPaymentMandate,
    )
    return verified.mandate_payload


def create_closed_payment_mandate(
    session: dict[str, Any],
    amount_tinybars: int,
) -> tuple[str, str, PaymentMandate]:
    agent_key = get_agent_signing_key()
    user_id = session["user_account_id"]
    agent_id = AGENT_ACCOUNT_ID or session.get("agent_account_id") or os.getenv("ACCOUNT_ID", "")
    instrument = hedera_payment_instrument(user_id, agent_id)
    checkout_hash = session.get("open_checkout_hash") or session["open_payment_hash"]

    payload = PaymentMandate(
        transaction_id=checkout_hash,
        payee=pocu_merchant(),
        payment_amount=Amount(amount=amount_tinybars, currency=HEDERA_AMOUNT_CURRENCY),
        payment_instrument=instrument,
    )

    nonce = uuid.uuid4().hex[:16]
    full_chain = MandateClient().present(
        holder_key=agent_key,
        mandate_token=session["open_payment_sdjwt"],
        payloads=[payload],
        nonce=nonce,
        aud="pocu-settlement",
    )
    closed_jwt = MandateClient().get_closed_mandate_jwt(full_chain)
    return full_chain, closed_jwt, payload


def build_payment_receipt(closed_mandate_jwt: str, hedera_tx_id: str) -> str:
    reference = compute_sha256_b64url(closed_mandate_jwt)
    receipt = PaymentReceipt(
        status="Success",
        iss=POCU_MERCHANT_WEBSITE,
        iat=int(time.time()),
        reference=reference,
        payment_id=str(uuid.uuid4()),
        psp_confirmation_id=hedera_tx_id,
        network_confirmation_id=hedera_tx_id,
    )
    payload = receipt.model_dump(exclude_none=True)
    return create_jwt({"alg": "ES256"}, payload, get_agent_signing_key())


def run_settlement(
    session: dict[str, Any],
    amount_tinybars: int,
    reason: str,
) -> dict[str, Any]:
    if session.get("status") != "active":
        raise ValueError(f"AP2 session not active (status={session.get('status')})")

    open_mandate = load_open_payment_mandate(session)
    ctx = mandate_context_from_session(session)
    _, closed_jwt, closed_payload = create_closed_payment_mandate(session, amount_tinybars)

    violations = check_hedera_payment_constraints(
        open_mandate,
        closed_payload,
        session.get("open_checkout_hash"),
        ctx,
    )
    if violations:
        raise ValueError(f"AP2 constraint violations: {'; '.join(violations)}")

    agent_id = AGENT_ACCOUNT_ID or os.getenv("ACCOUNT_ID", "")
    memo = f"AP2 {reason} session={str(session['id'])[:8]}"
    tx_id = execute_hbar_allowance_transfer(
        owner_account_id=session["user_account_id"],
        agent_account_id=agent_id,
        amount_tinybars=amount_tinybars,
        memo=memo,
    )
    receipt_jwt = build_payment_receipt(closed_jwt, tx_id)

    new_total = int(session.get("total_spent_tinybars") or 0) + amount_tinybars
    new_uses = int(session.get("total_uses") or 0) + 1
    budget_tinybars = int(float(session.get("budget_hbar") or 200) * 100_000_000)
    status = "exhausted" if new_total >= budget_tinybars else "active"

    return {
        "hedera_tx_id": tx_id,
        "receipt_jwt": receipt_jwt,
        "closed_mandate_ref": compute_sha256_b64url(closed_jwt),
        "amount_tinybars": amount_tinybars,
        "amount_hbar": tinybars_to_hbar(amount_tinybars),
        "reason": reason,
        "total_spent_tinybars": new_total,
        "total_uses": new_uses,
        "status": status,
    }
