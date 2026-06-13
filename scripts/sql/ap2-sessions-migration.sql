-- AP2 session tables + training_jobs cleanup.
-- Run in Supabase SQL editor (docs/ is gitignored; this script is committed under scripts/sql/).

create table if not exists public.ap2_sessions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.chat_threads(id) on delete cascade,
  user_account_id text not null,
  agent_account_id text not null default '',
  open_checkout_sdjwt text not null,
  open_payment_sdjwt text not null,
  open_checkout_hash text not null default '',
  open_payment_hash text not null,
  total_spent_tinybars bigint not null default 0,
  total_uses int not null default 0,
  budget_hbar numeric not null default 200,
  allowance_tx_id text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'active', 'exhausted', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ap2_sessions_thread_id_idx on public.ap2_sessions (thread_id);
create index if not exists ap2_sessions_user_status_idx on public.ap2_sessions (user_account_id, status);

create table if not exists public.ap2_payment_receipts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ap2_sessions(id) on delete cascade,
  reason text not null,
  amount_tinybars bigint not null,
  closed_mandate_ref text not null default '',
  receipt_jwt text not null default '',
  hedera_tx_id text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists ap2_payment_receipts_session_idx on public.ap2_payment_receipts (session_id);

alter table public.training_jobs add column if not exists ap2_session_id uuid
  references public.ap2_sessions(id) on delete set null;

alter table public.training_jobs drop column if exists acp_order_id;
alter table public.training_jobs drop column if exists acp_status;
alter table public.training_jobs drop column if exists acp_progress_pct;
alter table public.training_jobs drop column if exists ap2_mandate;
alter table public.training_jobs drop column if exists ap2_mandate_hash;
alter table public.training_jobs drop column if exists ap2_signature;

notify pgrst, 'reload schema';
