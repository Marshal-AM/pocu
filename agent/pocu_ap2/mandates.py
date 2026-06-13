from __future__ import annotations

import json
import time
import uuid
from typing import Any

from ap2.sdk.generated.open_checkout_mandate import (
    AllowedMerchants,
    Item,
    LineItemRequirements,
    LineItems,
    OpenCheckoutMandate,
)
from ap2.sdk.generated.open_payment_mandate import (
    AllowedPayees,
    AllowedPaymentInstruments,
    AmountRange,
    Budget,
    OpenPaymentMandate,
    PaymentReference,
)
from ap2.sdk.generated.types.merchant import Merchant
from ap2.sdk.generated.types.payment_instrument import PaymentInstrument
from ap2.sdk.mandate import MandateClient
from ap2.sdk.sdjwt import compute_sd_hash, parse_token

from pocu_ap2.config import (
    BATCH_GAS_BUFFER_HBAR,
    CHAT_TURN_HBAR,
    MANDATE_TTL_SEC,
    POCU_MERCHANT_ID,
    POCU_MERCHANT_NAME,
    POCU_MERCHANT_WEBSITE,
    SESSION_BUDGET_HBAR,
    hbar_to_tinybars,
)
from pocu_ap2.constraints_hedera import HEDERA_INSTRUMENT_TYPE
from pocu_ap2.keys import get_agent_signing_key, get_trusted_surface_key


def pocu_merchant() -> Merchant:
    return Merchant(
        id=POCU_MERCHANT_ID,
        name=POCU_MERCHANT_NAME,
        website=POCU_MERCHANT_WEBSITE,
    )


def hedera_payment_instrument(user_account_id: str, agent_account_id: str) -> PaymentInstrument:
    return PaymentInstrument(
        type=HEDERA_INSTRUMENT_TYPE,
        id=f"{user_account_id}:{agent_account_id}",
        description=f"HIP-745 HBAR allowance ({user_account_id} → {agent_account_id})",
    )


def build_open_mandates(
    *,
    user_account_id: str,
    agent_account_id: str,
    intent: str = "on-chain ML training and chat",
) -> dict[str, Any]:
    """Create AP2 open checkout + open payment SD-JWT pair."""
    trusted_key = get_trusted_surface_key()
    agent_key = get_agent_signing_key()
    agent_pub = json.loads(agent_key.export_public())
    cnf = {"jwk": agent_pub}
    now = int(time.time())
    exp = now + MANDATE_TTL_SEC
    merchant = pocu_merchant()

    open_checkout = OpenCheckoutMandate(
        constraints=[
            LineItems(
                items=[
                    LineItemRequirements(
                        id="line_chat_ml",
                        acceptable_items=[
                            Item(id="train_ml_model", title="POCU chat + on-chain ML training"),
                        ],
                        quantity=1,
                    )
                ]
            ),
            AllowedMerchants(allowed=[merchant]),
        ],
        cnf=cnf,
        iat=now,
        exp=exp,
    )

    client = MandateClient()
    open_checkout_sdjwt = client.create(payloads=[open_checkout], issuer_key=trusted_key)
    checkout_reference = compute_sd_hash(parse_token(open_checkout_sdjwt))

    # Single-charge cap: full session budget (chat turns are 0.1 HBAR; batches use actual gas).
    max_charge_tinybars = hbar_to_tinybars(SESSION_BUDGET_HBAR)
    instrument = hedera_payment_instrument(user_account_id, agent_account_id)

    open_payment = OpenPaymentMandate(
        constraints=[
            Budget(max=SESSION_BUDGET_HBAR, currency="USD"),
            AmountRange(currency="USD", min=0, max=max_charge_tinybars),
            AllowedPayees(allowed=[merchant]),
            AllowedPaymentInstruments(allowed=[instrument]),
            PaymentReference(conditional_transaction_id=checkout_reference),
        ],
        cnf=cnf,
        iat=now,
        exp=exp,
    )
    open_payment_sdjwt = client.create(payloads=[open_payment], issuer_key=trusted_key)
    open_payment_hash = compute_sd_hash(parse_token(open_payment_sdjwt))

    return {
        "open_checkout_sdjwt": open_checkout_sdjwt,
        "open_payment_sdjwt": open_payment_sdjwt,
        "open_checkout_hash": checkout_reference,
        "open_payment_hash": open_payment_hash,
        "budget_hbar": SESSION_BUDGET_HBAR,
        "chat_turn_hbar": CHAT_TURN_HBAR,
        "intent": intent,
        "expires_at": exp,
        "merchant": merchant.model_dump(exclude_none=True),
        "payment_instrument": instrument.model_dump(exclude_none=True),
    }
