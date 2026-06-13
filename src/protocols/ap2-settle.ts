import { ethers } from "ethers";
import { StepLogger } from "../logger";

const HBAR_TINYBARS = 100_000_000;
const SETTLE_FETCH_TIMEOUT_MS = parseInt(
  process.env.AP2_SETTLE_TIMEOUT_MS ?? "120000",
  10
);

export function gasCostFromReceipt(receipt: {
  gasUsed: bigint;
  gasPrice?: bigint | null;
}): bigint {
  const gasPrice = receipt.gasPrice ?? 0n;
  return receipt.gasUsed * gasPrice;
}

/** Project convention: ethers.formatEther(wei) yields the HBAR cost of an EVM tx. */
export function gasCostHbarFromWei(gasCostWei: bigint): number {
  return parseFloat(ethers.formatEther(gasCostWei));
}

export function hbarToTinybars(hbar: number): number {
  return Math.round(hbar * HBAR_TINYBARS);
}

/** Settle batch gas via agent AP2 session (closed mandate + HIP-745). */
export async function settleBatchViaAgent(params: {
  sessionId: string;
  batchIndex: number;
  receipt: { gasUsed: bigint; gasPrice?: bigint | null };
  jobId?: string;
  log?: StepLogger;
}): Promise<void> {
  const agentUrl = (process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const gasWei = gasCostFromReceipt(params.receipt);
  const batchHbar = gasCostHbarFromWei(gasWei);
  if (batchHbar <= 0) {
    params.log?.info(`[ap2] batch=${params.batchIndex} skip zero-cost settlement`);
    return;
  }
  const amountTinybars = hbarToTinybars(batchHbar);
  const reason = `training_batch_${params.batchIndex}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SETTLE_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${agentUrl}/ap2/sessions/${params.sessionId}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount_tinybars: amountTinybars,
        reason,
        batch_index: params.batchIndex,
        job_id: params.jobId,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `[ap2] batch settle timed out after ${SETTLE_FETCH_TIMEOUT_MS}ms — is the agent running on ${agentUrl}?`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`[ap2] batch settle failed (${res.status}): ${detail}`);
  }
  const body = (await res.json()) as { hedera_tx_id?: string; amount_hbar?: number };
  params.log?.info(
    `[ap2] batch=${params.batchIndex} gas=${batchHbar.toFixed(4)} HBAR settled tx=${body.hedera_tx_id ?? "?"}`
  );
}
