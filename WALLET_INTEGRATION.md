# Wallet & AP2 Integration

POCU wallet flows use **HashPack** (HIP-30) plus **real Google AP2** mandates — not custom JSON or fake ACP/MPP layers.

## Prerequisites

- HashPack on Hedera testnet
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_AGENT_ACCOUNT_ID`, `NEXT_PUBLIC_MODEL_NFT_TOKEN_ID` in `web/.env`
- Agent running with `ACCOUNT_ID` / `PRIVATE_KEY` and AP2 SDK installed (`pip install -r agent/requirements.txt`)

## New chat: AP2 session

1. User connects wallet (`WalletGate`)
2. `Ap2SetupModal` explains budget (200 HBAR default), 0.1 HBAR per reply, batch gas metering
3. Web calls `POST /api/ap2/sessions` → agent creates open checkout + payment SD-JWT pair
4. User approves HIP-745 allowance in HashPack
5. Web calls `POST /api/ap2/sessions/{id}/activate`
6. Chat composer unlocks; each message includes `ap2_session_id`

Implementation: [`web/lib/wallet/ap2-session.ts`](web/lib/wallet/ap2-session.ts), [`web/components/Ap2SetupGate.tsx`](web/components/Ap2SetupGate.tsx)

## Training

- Requires an **active AP2 session** for the chat thread (`training_jobs.ap2_session_id`)
- **NFT token associate** is a separate HashPack step before first training job (HTS deliverable)
- Batch gas is settled via agent AP2 `/settle` during on-chain execution

## Agent-side verification

[`agent/hedera_auth.py`](agent/hedera_auth.py) only verifies **HBAR allowance** on the mirror node. Mandate structure and signatures are handled by the AP2 SDK in [`agent/pocu_ap2/`](agent/pocu_ap2/).

## SDK install

The AP2 Python package is installed from GitHub (not from gitignored `docs/AP2/`):

```
ap2 @ git+https://github.com/google-agentic-commerce/AP2.git@main
```

See [`AP2_INTEGRATION.md`](AP2_INTEGRATION.md) for architecture and env vars.

## Database

Run [`scripts/sql/ap2-sessions-migration.sql`](scripts/sql/ap2-sessions-migration.sql) in Supabase before using AP2 sessions in production.
