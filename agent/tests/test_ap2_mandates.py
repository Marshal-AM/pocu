"""AP2 mandate unit tests."""

from __future__ import annotations

import json

import pytest
from ap2.sdk.generated.open_payment_mandate import OpenPaymentMandate
from ap2.sdk.mandate import MandateClient
from ap2.sdk.sdjwt import compute_sd_hash, parse_token

from pocu_ap2.constraints_hedera import HEDERA_INSTRUMENT_TYPE
from pocu_ap2.keys import get_trusted_surface_key
from pocu_ap2.mandates import build_open_mandates


def test_build_open_mandates_has_checkout_and_payment_pair():
    result = build_open_mandates(
        user_account_id="0.0.12345",
        agent_account_id="0.0.67890",
        intent="test chat",
    )
    assert result["open_checkout_sdjwt"]
    assert result["open_payment_sdjwt"]
    assert result["open_checkout_hash"]
    assert result["open_payment_hash"]
    assert result["budget_hbar"] == 200
    assert result["chat_turn_hbar"] == 0.1


def test_open_payment_mandate_verifies_with_trusted_key():
    result = build_open_mandates(
        user_account_id="0.0.111",
        agent_account_id="0.0.222",
    )
    trusted = get_trusted_surface_key()
    verified = MandateClient().verify(
        token=result["open_payment_sdjwt"],
        key_or_provider=trusted,
        payload_type=OpenPaymentMandate,
    )
    mandate = verified.mandate_payload
    assert mandate.cnf is not None
    assert mandate.cnf.get("jwk")
    has_instrument = any(
        getattr(c, "type", "") == "payment.allowed_payment_instruments"
        for c in mandate.constraints
    )
    assert has_instrument


def test_payment_reference_links_to_checkout_hash():
    result = build_open_mandates(
        user_account_id="0.0.111",
        agent_account_id="0.0.222",
    )
    checkout_hash = compute_sd_hash(parse_token(result["open_checkout_sdjwt"]))
    assert result["open_checkout_hash"] == checkout_hash
