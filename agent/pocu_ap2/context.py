from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from supabase_client import get_supabase


def insert_session(row: dict[str, Any]) -> dict[str, Any]:
    sb = get_supabase()
    result = sb.table("ap2_sessions").insert(row).execute()
    return result.data[0]


def get_session_row(session_id: str, user_account_id: str = "") -> Optional[dict[str, Any]]:
    sb = get_supabase()
    query = sb.table("ap2_sessions").select("*").eq("id", session_id)
    if user_account_id:
        query = query.eq("user_account_id", user_account_id)
    try:
        return query.single().execute().data
    except Exception:
        return None


def get_active_session_for_thread(thread_id: str) -> Optional[dict[str, Any]]:
    sb = get_supabase()
    try:
        result = (
            sb.table("ap2_sessions")
            .select("*")
            .eq("thread_id", thread_id)
            .eq("status", "active")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None
    except Exception:
        return None


def update_session(session_id: str, patch: dict[str, Any]) -> None:
    sb = get_supabase()
    sb.table("ap2_sessions").update(patch).eq("id", session_id).execute()


def insert_receipt(row: dict[str, Any]) -> None:
    sb = get_supabase()
    sb.table("ap2_payment_receipts").insert(row).execute()


def apply_settlement_to_session(session_id: str, settlement: dict[str, Any]) -> None:
    update_session(
        session_id,
        {
            "total_spent_tinybars": settlement["total_spent_tinybars"],
            "total_uses": settlement["total_uses"],
            "status": settlement["status"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    insert_receipt(
        {
            "session_id": session_id,
            "reason": settlement["reason"],
            "amount_tinybars": settlement["amount_tinybars"],
            "closed_mandate_ref": settlement["closed_mandate_ref"],
            "receipt_jwt": settlement["receipt_jwt"],
            "hedera_tx_id": settlement["hedera_tx_id"],
        }
    )
