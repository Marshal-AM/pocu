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
import { fetchHbarAllowance, isTokenAssociated } from "./mirror";
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

const STEP_MESSAGES: Record<Ap2SetupStep, string> = {
  allowance: `Approve ${ALLOWANCE_HBAR} HBAR allowance for this chat session.`,
  associate: "Associate the model NFT token (required before training).",
  activate: "Activating AP2 session with agent…",
};

export async function approveAp2Allowance(
  userAccountId: string,
  onStep?: (step: Ap2SetupStep, message: string) => void
): Promise<string> {
  const { agentAccountId } = requireWalletConfig();
  const report = (step: Ap2SetupStep) => onStep?.(step, STEP_MESSAGES[step]);

  const existing = await fetchHbarAllowance(userAccountId, agentAccountId);
  if (existing >= ALLOWANCE_HBAR) {
    onStep?.("allowance", `Allowance already set (${existing} HBAR). Skipping.`);
    return "existing_allowance";
  }

  report("allowance");
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
  const res = await fetch("/api/ap2/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: params.threadId,
      user_account_id: params.userAccountId,
      intent: params.intent ?? "POCU chat and on-chain ML training",
    }),
  });
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
  const res = await fetch(`/api/ap2/sessions/${params.sessionId}/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_account_id: params.userAccountId,
      allowance_tx_id: params.allowanceTxId,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Ap2SessionState;
}

export async function setupAp2Session(params: {
  threadId: string;
  userAccountId: string;
  intent?: string;
  includeNftAssociate?: boolean;
  onStep?: (step: Ap2SetupStep, message: string) => void;
}): Promise<Ap2SessionState> {
  const pending = await createAp2Session({
    threadId: params.threadId,
    userAccountId: params.userAccountId,
    intent: params.intent,
  });
  const allowanceTxId = await approveAp2Allowance(params.userAccountId, params.onStep);
  await pauseBetweenWalletSteps();
  if (params.includeNftAssociate) {
    await associateModelNftIfNeeded(params.userAccountId, params.onStep);
    await pauseBetweenWalletSteps();
  }
  return activateAp2Session({
    sessionId: pending.session_id,
    userAccountId: params.userAccountId,
    allowanceTxId,
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
  return (await res.json()) as Ap2SessionState;
}
