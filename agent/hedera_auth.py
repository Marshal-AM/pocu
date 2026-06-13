from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any, Optional

MIRROR_URL = os.getenv("HEDERA_MIRROR_URL", "https://testnet.mirrornode.hedera.com").rstrip("/")
AGENT_ACCOUNT_ID = os.getenv("ACCOUNT_ID", "")
ALLOWANCE_HBAR = float(os.getenv("ALLOWANCE_HBAR", os.getenv("AP2_SESSION_BUDGET_HBAR", "200")))


def _mirror_get(path: str) -> dict[str, Any]:
    url = f"{MIRROR_URL}{path}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Mirror node error {e.code} for {path}: {body}") from e


def get_hbar_allowance_tinybars(owner_account_id: str, spender_account_id: str) -> int:
    path = f"/api/v1/accounts/{owner_account_id}/allowances/crypto"
    url = f"{MIRROR_URL}{path}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return 0
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Mirror node error {e.code} for {path}: {body}") from e

    allowances = data.get("allowances") or []
    for row in allowances:
        spender = (row.get("spender") or "").strip()
        if spender == spender_account_id:
            return int(row.get("amount") or row.get("amount_granted") or 0)
    return 0


def verify_allowance(
    user_account_id: str,
    spender_account_id: Optional[str] = None,
    min_hbar: float = ALLOWANCE_HBAR,
) -> str:
    spender = spender_account_id or AGENT_ACCOUNT_ID
    if not spender:
        raise ValueError("AGENT_ACCOUNT_ID / ACCOUNT_ID not configured")

    tinybars = 0
    for attempt in range(5):
        tinybars = get_hbar_allowance_tinybars(user_account_id, spender)
        if tinybars / 1e8 >= min_hbar:
            break
        if attempt < 4:
            print(
                f"[wallet] allowance not visible yet (attempt {attempt + 1}/5), "
                "waiting for mirror node…"
            )
            time.sleep(2)

    hbar = tinybars / 1e8
    print(f"[wallet] allowance check owner={user_account_id} spender={spender} amount={hbar} HBAR")
    if hbar < min_hbar:
        raise ValueError(
            f"Insufficient HBAR allowance: {hbar} < {min_hbar} HBAR required. "
            f"Approve at least {min_hbar} HBAR in HashPack."
        )
    return spender
