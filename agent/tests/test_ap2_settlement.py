"""AP2 settlement constraint tests (Hedera mocked)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from ap2.sdk.generated.payment_mandate import PaymentMandate
from ap2.sdk.generated.types.amount import Amount

from pocu_ap2.constraints_hedera import (
    HEDERA_AMOUNT_CURRENCY,
    check_hedera_payment_constraints,
    mandate_context_from_session,
)
from pocu_ap2.mandates import build_open_mandates, hedera_payment_instrument
from pocu_ap2.settlement import run_settlement


def _session_row(**overrides):
    base = build_open_mandates(user_account_id="0.0.1001", agent_account_id="0.0.2002")
    row = {
        "id": "sess-test-1",
        "user_account_id": "0.0.1001",
        "agent_account_id": "0.0.2002",
        "open_checkout_sdjwt": base["open_checkout_sdjwt"],
        "open_payment_sdjwt": base["open_payment_sdjwt"],
        "open_checkout_hash": base["open_checkout_hash"],
        "open_payment_hash": base["open_payment_hash"],
        "total_spent_tinybars": 0,
        "total_uses": 0,
        "budget_hbar": 200,
        "status": "active",
    }
    row.update(overrides)
    return row


def test_budget_constraint_rejects_overspend():
    open_mandate = __import__(
        "ap2.sdk.mandate", fromlist=["MandateClient"]
    ).MandateClient().verify(
        token=_session_row()["open_payment_sdjwt"],
        key_or_provider=__import__(
            "pocu_ap2.keys", fromlist=["get_trusted_surface_key"]
        ).get_trusted_surface_key(),
        payload_type=__import__(
            "ap2.sdk.generated.open_payment_mandate", fromlist=["OpenPaymentMandate"]
        ).OpenPaymentMandate,
    ).mandate_payload

    closed = PaymentMandate(
        transaction_id=_session_row()["open_checkout_hash"],
        payee=__import__("pocu_ap2.mandates", fromlist=["pocu_merchant"]).pocu_merchant(),
        payment_amount=Amount(amount=50_000_000, currency=HEDERA_AMOUNT_CURRENCY),
        payment_instrument=hedera_payment_instrument("0.0.1001", "0.0.2002"),
    )
    ctx = mandate_context_from_session({"total_spent_tinybars": 199_000_000_000, "total_uses": 1})
    violations = check_hedera_payment_constraints(
        open_mandate, closed, _session_row()["open_checkout_hash"], ctx
    )
    assert violations


@patch("pocu_ap2.settlement.execute_hbar_allowance_transfer", return_value="0.0.100@123.456")
def test_run_settlement_success(mock_transfer):
    session = _session_row()
    result = run_settlement(session, 10_000_000, "chat_turn")
    assert result["amount_tinybars"] == 10_000_000
    assert result["hedera_tx_id"] == "0.0.100@123.456"
    assert result["reason"] == "chat_turn"
    mock_transfer.assert_called_once()
