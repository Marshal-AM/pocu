from __future__ import annotations

import os

HBAR_TINYBARS = 100_000_000

SESSION_BUDGET_HBAR = float(os.getenv("AP2_SESSION_BUDGET_HBAR", "200"))
CHAT_TURN_HBAR = float(os.getenv("AP2_CHAT_TURN_HBAR", "0.1"))
MANDATE_TTL_SEC = int(os.getenv("AP2_MANDATE_TTL_SEC", str(2 * 60 * 60)))
ALLOWANCE_HBAR = float(os.getenv("ALLOWANCE_HBAR", "200"))
BATCH_GAS_BUFFER_HBAR = float(os.getenv("BATCH_GAS_BUFFER_HBAR", "15"))

AGENT_ACCOUNT_ID = os.getenv("ACCOUNT_ID", "")
POCU_MERCHANT_ID = os.getenv("POCU_MERCHANT_ID", "pocu-hedera-ml")
POCU_MERCHANT_NAME = os.getenv("POCU_MERCHANT_NAME", "POCU On-Chain ML")
POCU_MERCHANT_WEBSITE = os.getenv("POCU_MERCHANT_WEBSITE", "https://pocu.local")


def hbar_to_tinybars(hbar: float) -> int:
    return int(round(hbar * HBAR_TINYBARS))


def tinybars_to_hbar(tinybars: int) -> float:
    return tinybars / HBAR_TINYBARS
