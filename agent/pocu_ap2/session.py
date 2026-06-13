from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from pocu_ap2.config import (
    AGENT_ACCOUNT_ID,
    CHAT_TURN_HBAR,
    SESSION_BUDGET_HBAR,
    hbar_to_tinybars,
)
from pocu_ap2.context import (
    apply_settlement_to_session,
    get_active_session_for_thread,
    get_session_row,
    insert_session,
    update_session,
)
from pocu_ap2.mandates import build_open_mandates
from pocu_ap2.settlement import run_settlement

try:
    from hedera_auth import verify_allowance
except ImportError:
    from agent.hedera_auth import verify_allowance  # type: ignore


def create_session(
    *,
    thread_id: str,
    user_account_id: str,
    intent: str = "POCU chat and on-chain ML training",
) -> dict[str, Any]:
    agent_id = AGENT_ACCOUNT_ID or os.getenv("ACCOUNT_ID", "")
    if not agent_id:
        raise RuntimeError("ACCOUNT_ID not configured")

    mandates = build_open_mandates(
        user_account_id=user_account_id,
        agent_account_id=agent_id,
        intent=intent,
    )
    session_id = str(uuid.uuid4())
    row = {
        "id": session_id,
        "thread_id": thread_id,
        "user_account_id": user_account_id,
        "agent_account_id": agent_id,
        "open_checkout_sdjwt": mandates["open_checkout_sdjwt"],
        "open_payment_sdjwt": mandates["open_payment_sdjwt"],
        "open_checkout_hash": mandates["open_checkout_hash"],
        "open_payment_hash": mandates["open_payment_hash"],
        "total_spent_tinybars": 0,
        "total_uses": 0,
        "budget_hbar": SESSION_BUDGET_HBAR,
        "allowance_tx_id": "",
        "status": "pending",
        "expires_at": datetime.fromtimestamp(mandates["expires_at"], tz=timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    created = insert_session(row)
    return {
        "session_id": created["id"],
        "status": "pending",
        "budget_hbar": SESSION_BUDGET_HBAR,
        "chat_turn_hbar": CHAT_TURN_HBAR,
        "intent": intent,
        "merchant": mandates["merchant"],
        "payment_instrument": mandates["payment_instrument"],
        "expires_at": mandates["expires_at"],
        "summary": (
            f"Authorize up to {SESSION_BUDGET_HBAR} HBAR for this chat session. "
            f"Each agent reply costs {CHAT_TURN_HBAR} HBAR; training batches bill actual gas."
        ),
    }


def activate_session(
    session_id: str,
    user_account_id: str,
    allowance_tx_id: str = "",
) -> dict[str, Any]:
    session = get_session_row(session_id, user_account_id)
    if not session:
        raise ValueError("AP2 session not found")
    if session.get("status") != "pending":
        raise ValueError(f"Session cannot be activated (status={session.get('status')})")

    exp = session.get("expires_at")
    if exp and time.time() > datetime.fromisoformat(exp.replace("Z", "+00:00")).timestamp():
        update_session(session_id, {"status": "expired"})
        raise ValueError("AP2 mandate expired")

    verify_allowance(user_account_id, min_hbar=CHAT_TURN_HBAR)
    update_session(
        session_id,
        {
            "status": "active",
            "allowance_tx_id": allowance_tx_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return {
        "session_id": session_id,
        "status": "active",
        "budget_hbar": session.get("budget_hbar"),
        "remaining_hbar": float(session.get("budget_hbar") or SESSION_BUDGET_HBAR),
    }


def get_session(session_id: str, user_account_id: str = "") -> Optional[dict[str, Any]]:
    row = get_session_row(session_id, user_account_id)
    if not row:
        return None
    spent = int(row.get("total_spent_tinybars") or 0)
    budget = hbar_to_tinybars(float(row.get("budget_hbar") or SESSION_BUDGET_HBAR))
    return {
        **row,
        "spent_hbar": spent / 100_000_000,
        "remaining_hbar": max(0, budget - spent) / 100_000_000,
    }


def validate_active_session(session_id: str, user_account_id: str) -> dict[str, Any]:
    session = get_session_row(session_id, user_account_id)
    if not session:
        raise ValueError("AP2 session not found")
    if session.get("status") != "active":
        raise ValueError("AP2 session is not active — complete authorization first")
    exp = session.get("expires_at")
    if exp:
        exp_ts = datetime.fromisoformat(exp.replace("Z", "+00:00")).timestamp()
        if time.time() > exp_ts:
            update_session(session_id, {"status": "expired"})
            raise ValueError("AP2 session expired")
    return session


def settle_payment(
    session_id: str,
    amount_tinybars: int,
    reason: str,
    user_account_id: str = "",
) -> dict[str, Any]:
    session = validate_active_session(session_id, user_account_id) if user_account_id else get_session_row(session_id)
    if not session:
        raise ValueError("AP2 session not found")
    if session.get("status") != "active":
        raise ValueError("AP2 session not active")

    result = run_settlement(session, amount_tinybars, reason)
    apply_settlement_to_session(session_id, result)
    print(
        f"[ap2] settled reason={reason} amount={result['amount_hbar']:.4f} HBAR "
        f"tx={result['hedera_tx_id']}"
    )
    return result


def settle_chat_turn(session_id: str, user_account_id: str) -> dict[str, Any]:
    amount = hbar_to_tinybars(CHAT_TURN_HBAR)
    return settle_payment(session_id, amount, "chat_turn", user_account_id)


def get_thread_session(thread_id: str) -> Optional[dict[str, Any]]:
    return get_active_session_for_thread(thread_id)
