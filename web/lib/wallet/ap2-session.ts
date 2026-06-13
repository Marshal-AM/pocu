"use client";

import {
  AccountAllowanceApproveTransaction,
  AccountId,
  Hbar,
  HbarUnit,
  TokenAssociateTransaction,
  TokenId,
} from "@hiero-ledger/sdk";
import {
  ALLOWANCE_HBAR,
  CHAT_TURN_HBAR,
  SESSION_BUDGET_HBAR,
  assertWalletConfigMatchesAgent,
  type AgentAp2Config,
  requireWalletConfig,
} from "./config";
import { fetchHbarAllowance, isTokenAssociated, waitForHbarAllowance } from "./mirror";
import { pauseBetweenWalletSteps, walletSignAndExecute } from "./wallet-tx";

export interface Ap2SessionState {
  session_id: string;
  status: string;
  budget_hbar?: number;
  chat_turn_hbar?: number;
  remaining_hbar?: number;
  summary?: string;
}

/** Agent GET returns DB row (`id`); create/activate return `session_id`. */
export function normalizeAp2Session(raw: Record<string, unknown>): Ap2SessionState {
  const session_id = String(raw.session_id ?? raw.id ?? "").trim();
  return {
    session_id,
    status: String(raw.status ?? ""),
    budget_hbar:
      raw.budget_hbar != null ? Number(raw.budget_hbar) : undefined,
    chat_turn_hbar:
      raw.chat_turn_hbar != null ? Number(raw.chat_turn_hbar) : undefined,
    remaining_hbar:
      raw.remaining_hbar != null ? Number(raw.remaining_hbar) : undefined,
    summary: raw.summary != null ? String(raw.summary) : undefined,
  };
}

export type Ap2SetupStep = "allowance" | "associate" | "activate";

const AGENT_FETCH_TIMEOUT_MS = 90_000;
const MIRROR_ALLOWANCE_TIMEOUT_MS = 90_000;
const MIRROR_ALLOWANCE_INTERVAL_MS = 2_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  label: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `${label} timed out after ${AGENT_FETCH_TIMEOUT_MS / 1000}s. Is the agent running on port 8000?`
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const STEP_MESSAGES: Record<Ap2SetupStep, string> = {
  allowance: `Open HashPack and approve ${ALLOWANCE_HBAR} HBAR allowance for this session.`,
  associate: "Associate the model NFT token (required before training).",
  activate: "Activating AP2 session with agent…",
};

function buildAllowanceTransaction(userAccountId: string, agentAccountId: string) {
  return new AccountAllowanceApproveTransaction()
    .approveHbarAllowance(
      AccountId.fromString(userAccountId),
      AccountId.fromString(agentAccountId),
      Hbar.from(ALLOWANCE_HBAR, HbarUnit.Hbar)
    )
    .setTransactionMemo(`POCU AP2 session allowance ${ALLOWANCE_HBAR} HBAR`);
}

/** Always opens HashPack for session authorize; mirror poll only when allowance not yet on-chain. */
export async function authorizeSessionAllowance(
  userAccountId: string,
  onStep?: (step: Ap2SetupStep, message: string) => void
): Promise<string> {
  const { agentAccountId } = requireWalletConfig();
  const baseline = await fetchHbarAllowance(userAccountId, agentAccountId);

  onStep?.("allowance", STEP_MESSAGES.allowance);

  const walletTx = () =>
    walletSignAndExecute(
      userAccountId,
      buildAllowanceTransaction(userAccountId, agentAccountId),
      "AP2 session allowance"
    );

  if (baseline >= ALLOWANCE_HBAR) {
    try {
      return await walletTx();
    } catch (e) {
      const final = await fetchHbarAllowance(userAccountId, agentAccountId);
      if (final >= ALLOWANCE_HBAR) return "existing_allowance";
      throw e;
    }
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (txId: string) => {
      if (settled) return;
      settled = true;
      resolve(txId);
    };

    walletTx()
      .then(finish)
      .catch(() => {
        /* WalletConnect may hang after user approves — mirror poll can still win. */
      });

    waitForHbarAllowance(
      userAccountId,
      agentAccountId,
      ALLOWANCE_HBAR,
      MIRROR_ALLOWANCE_TIMEOUT_MS,
      MIRROR_ALLOWANCE_INTERVAL_MS,
      () =>
        onStep?.("allowance", "Waiting for allowance confirmation on-chain…")
    )
      .then(() => finish("mirror_confirmed"))
      .catch(async (err) => {
        if (settled) return;
        const final = await fetchHbarAllowance(userAccountId, agentAccountId);
        if (final >= ALLOWANCE_HBAR) {
          finish("mirror_confirmed");
          return;
        }
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

/** @deprecated use authorizeSessionAllowance for session authorize */
export async function approveAp2Allowance(
  userAccountId: string,
  onStep?: (step: Ap2SetupStep, message: string) => void
): Promise<string> {
  return authorizeSessionAllowance(userAccountId, onStep);
}

export async function associateModelNftIfNeeded(
  userAccountId: string,
  onStep?: (step: Ap2SetupStep, message: string) => void
): Promise<string> {
  const { modelNftTokenId } = requireWalletConfig();
  if (await isTokenAssociated(userAccountId, modelNftTokenId)) {
    onStep?.("associate", "Model NFT token already associated. Skipping.");
    return "already_associated";
  }

  onStep?.("associate", STEP_MESSAGES.associate);
  try {
    const txId = await walletSignAndExecute(
      userAccountId,
      new TokenAssociateTransaction()
        .setAccountId(AccountId.fromString(userAccountId))
        .setTokenIds([TokenId.fromString(modelNftTokenId)]),
      "model NFT token associate"
    );
    await pauseBetweenWalletSteps();
    return txId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/TOKEN_ALREADY_ASSOCIATED/i.test(msg)) return "already_associated";
    throw e;
  }
}

export async function createAp2Session(params: {
  threadId: string;
  userAccountId: string;
  intent?: string;
}): Promise<Ap2SessionState> {
  const res = await fetchWithTimeout(
    "/api/ap2/sessions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thread_id: params.threadId,
        user_account_id: params.userAccountId,
        intent: params.intent ?? "POCU chat and on-chain ML training",
      }),
    },
    "AP2 session creation"
  );
  if (!res.ok) throw new Error(await res.text());
  return normalizeAp2Session((await res.json()) as Record<string, unknown>);
}

export async function activateAp2Session(params: {
  sessionId: string;
  userAccountId: string;
  allowanceTxId: string;
  onStep?: (step: Ap2SetupStep, message: string) => void;
}): Promise<Ap2SessionState> {
  params.onStep?.("activate", "Activating session…");
  const res = await fetchWithTimeout(
    `/api/ap2/sessions/${params.sessionId}/activate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_account_id: params.userAccountId,
        allowance_tx_id: params.allowanceTxId,
      }),
    },
    "AP2 session activation"
  );
  if (!res.ok) throw new Error(await res.text());
  return normalizeAp2Session((await res.json()) as Record<string, unknown>);
}

export async function completeAp2SessionAfterAllowance(params: {
  threadId: string;
  userAccountId: string;
  allowanceTxId: string;
  intent?: string;
  onStep?: (step: Ap2SetupStep, message: string) => void;
}): Promise<Ap2SessionState> {
  params.onStep?.("activate", "Creating AP2 session (signing mandates)…");
  const pending = await createAp2Session({
    threadId: params.threadId,
    userAccountId: params.userAccountId,
    intent: params.intent,
  });

  return activateAp2Session({
    sessionId: pending.session_id,
    userAccountId: params.userAccountId,
    allowanceTxId: params.allowanceTxId,
    onStep: params.onStep,
  });
}

export async function setupAp2Session(params: {
  threadId: string;
  userAccountId: string;
  intent?: string;
  includeNftAssociate?: boolean;
  allowanceTxId?: string;
  onStep?: (step: Ap2SetupStep, message: string) => void;
}): Promise<Ap2SessionState> {
  const allowanceTxId =
    params.allowanceTxId ??
    (await authorizeSessionAllowance(params.userAccountId, params.onStep));
  await pauseBetweenWalletSteps();

  if (params.includeNftAssociate) {
    await associateModelNftIfNeeded(params.userAccountId, params.onStep);
    await pauseBetweenWalletSteps();
  }

  return completeAp2SessionAfterAllowance({
    threadId: params.threadId,
    userAccountId: params.userAccountId,
    allowanceTxId,
    intent: params.intent,
    onStep: params.onStep,
  });
}

export async function fetchAp2Session(
  sessionId: string,
  userAccountId: string
): Promise<Ap2SessionState | null> {
  const res = await fetch(
    `/api/ap2/sessions/${sessionId}?user_account_id=${encodeURIComponent(userAccountId)}`
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return normalizeAp2Session((await res.json()) as Record<string, unknown>);
}

export async function fetchAp2Config(): Promise<AgentAp2Config> {
  const res = await fetchWithTimeout("/api/ap2/config", {}, "AP2 config fetch");
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as AgentAp2Config;
}

/** Fail fast when web/.env.local does not match agent + hts deployment. */
export async function validateWalletConfigAgainstAgent(): Promise<void> {
  const expected = await fetchAp2Config();
  assertWalletConfigMatchesAgent(expected);
}

/**
 * Re-validate AP2 session on agent + mirror allowance + NFT associate before chat/train.
 */
export async function ensureAp2ReadyForTraining(params: {
  userAccountId: string;
  session: Ap2SessionState | null;
  onStep?: (step: Ap2SetupStep, message: string) => void;
}): Promise<Ap2SessionState> {
  if (!params.session?.session_id) {
    throw new Error("Authorize an AP2 session before chatting or training.");
  }

  await validateWalletConfigAgainstAgent();

  const live = await fetchAp2Session(params.session.session_id, params.userAccountId);
  if (!live || live.status !== "active") {
    throw new Error("AP2 session is not active — re-authorize in the setup modal.");
  }

  const { agentAccountId } = requireWalletConfig();
  const budgetRemaining =
    live.remaining_hbar ?? live.budget_hbar ?? SESSION_BUDGET_HBAR;
  if (budgetRemaining < CHAT_TURN_HBAR) {
    throw new Error(
      `Session budget exhausted (${budgetRemaining.toFixed(2)} HBAR remaining). ` +
        "Re-authorize the AP2 session in HashPack."
    );
  }

  const allowance = await fetchHbarAllowance(params.userAccountId, agentAccountId);
  if (allowance < CHAT_TURN_HBAR) {
    throw new Error(
      `Insufficient HBAR allowance (${allowance.toFixed(2)} HBAR on-chain). ` +
        "Re-authorize the AP2 session in HashPack."
    );
  }

  await associateModelNftIfNeeded(params.userAccountId, params.onStep);
  if (!live.session_id) {
    return normalizeAp2Session({
      ...live,
      session_id: params.session.session_id,
    });
  }
  return live;
}
