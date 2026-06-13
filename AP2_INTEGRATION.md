# AP2 Integration (POCU)

POCU uses the **official Google AP2 Python SDK** installed from GitHub — not a vendored copy under `docs/AP2` (that folder is local reference only and gitignored).

## Install

```bash
cd agent
python -m venv .venv
.venv/Scripts/activate   # Windows
pip install -r requirements.txt
```

`agent/requirements.txt` pins:

```
ap2 @ git+https://github.com/google-agentic-commerce/AP2.git@main
```

## Architecture

| Layer | Package | Role |
|-------|---------|------|
| AP2 SDK | `ap2` (PyPI-style install from GitHub) | SD-JWT mandates, constraint checks, payment receipts |
| POCU adapter | `agent/pocu_ap2/` | Session lifecycle, Hedera HIP-745 rail, Supabase persistence |

`pocu_ap2` imports from the real SDK:

```python
from ap2.sdk.mandate import MandateClient
from ap2.sdk.generated.open_payment_mandate import OpenPaymentMandate
```

## Hedera payment instrument extension

HBAR is not ISO-4217. POCU uses an AP2 extension:

- `PaymentInstrument.type = "hedera_hbar_allowance"`
- `PaymentInstrument.id = "{user_account_id}:{agent_account_id}"`
- Amounts in **tinybars** (1 HBAR = 10⁸ tinybars)
- `HederaBudgetEvaluator` in `pocu_ap2/constraints_hedera.py` interprets `Budget.max` as HBAR while payment amounts are tinybars

## Session flow

1. **New chat** → `POST /ap2/sessions` creates open checkout + open payment SD-JWT pair (signed by trusted-surface key)
2. User approves HIP-745 allowance in HashPack
3. `POST /ap2/sessions/{id}/activate` verifies allowance on mirror node
4. Each chat reply → closed `PaymentMandate` + 0.1 HBAR transfer + `PaymentReceipt`
5. Each training batch → same flow with actual EVM gas (via `src/protocols/ap2-settle.ts` → agent `/settle`)

## Database

Run `scripts/sql/ap2-sessions-migration.sql` in Supabase:

- `ap2_sessions` — one row per chat thread mandate pair
- `ap2_payment_receipts` — settlement audit trail
- `training_jobs.ap2_session_id` — links jobs to session

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `AP2_SESSION_BUDGET_HBAR` | 200 | Open mandate budget |
| `AP2_CHAT_TURN_HBAR` | 0.1 | Per assistant reply |
| `AP2_MANDATE_TTL_SEC` | 7200 | Mandate expiry |
| `AP2_TRUSTED_SURFACE_KEY` | auto-generated file | Signs open mandates |
| `AP2_AGENT_SIGNING_KEY` | auto-generated file | Signs closed payments |
| `BATCH_GAS_BUFFER_HBAR` | 15 | Cost estimate buffer (not a hard cap) |

## Reference

Local AP2 spec/samples (not committed): `docs/AP2/` — compare schemas and sample agents when extending constraints.
