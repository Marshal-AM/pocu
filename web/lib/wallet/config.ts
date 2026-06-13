export const ALLOWANCE_HBAR = parseFloat(process.env.NEXT_PUBLIC_ALLOWANCE_HBAR ?? "200");
export const SESSION_BUDGET_HBAR = parseFloat(process.env.NEXT_PUBLIC_AP2_SESSION_BUDGET_HBAR ?? "200");
export const CHAT_TURN_HBAR = parseFloat(process.env.NEXT_PUBLIC_AP2_CHAT_TURN_HBAR ?? "0.1");
export const MANDATE_TTL_SEC = 2 * 60 * 60;

export function requireWalletConfig(): {
  projectId: string;
  agentAccountId: string;
  network: "testnet" | "mainnet";
  modelNftTokenId: string;
} {
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error(
      "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required — get one from https://cloud.reown.com"
    );
  }
  const agentAccountId = process.env.NEXT_PUBLIC_AGENT_ACCOUNT_ID?.trim();
  if (!agentAccountId) {
    throw new Error("NEXT_PUBLIC_AGENT_ACCOUNT_ID is required (same as root ACCOUNT_ID)");
  }
  const network = (process.env.NEXT_PUBLIC_HEDERA_NETWORK ?? "testnet") as "testnet" | "mainnet";
  const modelNftTokenId = process.env.NEXT_PUBLIC_MODEL_NFT_TOKEN_ID?.trim() ?? "";
  if (!modelNftTokenId) {
    throw new Error(
      "NEXT_PUBLIC_MODEL_NFT_TOKEN_ID is required — run scripts/deploy-hts-model-collection.ts"
    );
  }
  return { projectId, agentAccountId, network, modelNftTokenId };
}

export interface AgentAp2Config {
  agent_account_id: string;
  model_nft_token_id: string;
  allowance_hbar: number;
}

/** Compare web public env against agent-reported config (via /api/ap2/config). */
export function assertWalletConfigMatchesAgent(expected: AgentAp2Config): void {
  const { agentAccountId, modelNftTokenId } = requireWalletConfig();
  if (expected.agent_account_id !== agentAccountId) {
    throw new Error(
      `NEXT_PUBLIC_AGENT_ACCOUNT_ID is ${agentAccountId} but agent expects ${expected.agent_account_id}. ` +
        "Update web/.env.local to match root ACCOUNT_ID."
    );
  }
  if (expected.model_nft_token_id !== modelNftTokenId) {
    throw new Error(
      `NEXT_PUBLIC_MODEL_NFT_TOKEN_ID is ${modelNftTokenId} but agent expects ${expected.model_nft_token_id}. ` +
        "Update web/.env.local from deployments/hts.json."
    );
  }
}
