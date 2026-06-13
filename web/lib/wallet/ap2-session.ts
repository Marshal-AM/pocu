"use client";

import {
  AccountAllowanceApproveTransaction,
  AccountId,
  Hbar,
  HbarUnit,
  TokenAssociateTransaction,
  TokenId,
} from "@hiero-ledger/sdk";
import { ALLOWANCE_HBAR, requireWalletConfig } from "./config";
import { getDAppConnector, getHip30AccountId } from "./hedera-wallet";
import { isTokenAssociated } from "./mirror";
import { pauseBetweenWalletSteps, walletSignAndExecute } from "./wallet-tx";

export interface Ap2SessionState {
  session_id: string;
  status: string;
  budget_hbar?: number;
  chat_turn_hbar?: number;
  remaining_hbar?: number;
  summary?: string;
}

export type Ap2SetupStep = "allowance" | "associate" | "activate";

const AGENT_FETCH_TIMEOUT_MS = 90_000;

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

export async function approveAp2Allowance(
  userAccountId: string,
  onStep?: (step: Ap2SetupStep, message: string) => void
): Promise<string> {
  const { agentAccountId } = requireWalletConfig();
  onStep?.("allowance", STEP_MESSAGES.allowance);
  return walletSignAndExecute(
    userAccountId,
    new AccountAllowanceApproveTransaction()
      .approveHbarAllowance(
        AccountId.fromString(userAccountId),
        AccountId.fromString(agentAccountId),
        Hbar.from(ALLOWANCE_HBAR, HbarUnit.Hbar)
      )
      .setTransactionMemo(`POCU AP2 session allowance ${ALLOWANCE_HBAR} HBAR`),
    "AP2 session allowance"
  );
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
  return (await res.json()) as Ap2SessionState;
}

export async function activateAp2Session(params: {
  sessionId: string;
  userAccountId: string;
  allowanceTxId: string;
  onStep?: (step: Ap2SetupStep, message: string) => void;
}): Promise<Ap2SessionState> {
  params.onStep?.("activate", STEP_MESSAGES.activate);
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
  return (await res.json()) as Ap2SessionState;
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
    (await approveAp2Allowance(params.userAccountId, params.onStep));
  await pauseBetweenWalletSteps();

  if (params.includeNftAssociate) {
    await associateModelNftIfNeeded(params.userAccountId, params.onStep);
    await pauseBetweenWalletSteps();
  }

  params.onStep?.("activate", "Creating AP2 session…");
  const pending = await createAp2Session({
    threadId: params.threadId,
    userAccountId: params.userAccountId,
    intent: params.intent,
  });

  return activateAp2Session({
    sessionId: pending.session_id,
    userAccountId: params.userAccountId,
    allowanceTxId,
    onStep: (step, msg) => params.onStep?.(step, msg),
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
  return (await res.json()) as Ap2SessionState;
}
