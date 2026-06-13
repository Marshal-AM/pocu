const MIRROR_URL =
  process.env.NEXT_PUBLIC_HEDERA_NETWORK === "mainnet"
    ? "https://mainnet.mirrornode.hedera.com"
    : "https://testnet.mirrornode.hedera.com";

export async function fetchHbarAllowance(
  ownerAccountId: string,
  spenderAccountId: string
): Promise<number> {
  const res = await fetch(
    `${MIRROR_URL}/api/v1/accounts/${ownerAccountId}/allowances/crypto`
  );
  if (res.status === 404) return 0;
  if (!res.ok) return 0;
  const data = (await res.json()) as {
    allowances?: { spender?: string; amount?: number; amount_granted?: number }[];
  };
  for (const row of data.allowances ?? []) {
    if ((row.spender ?? "").trim() === spenderAccountId) {
      return Number(row.amount ?? row.amount_granted ?? 0) / 1e8;
    }
  }
  return 0;
}

/** Poll mirror until allowance >= minHbar or timeout. */
export async function waitForHbarAllowance(
  ownerAccountId: string,
  spenderAccountId: string,
  minHbar: number,
  timeoutMs = 90_000,
  intervalMs = 2_000,
  onPoll?: () => void
): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    onPoll?.();
    const amount = await fetchHbarAllowance(ownerAccountId, spenderAccountId);
    if (amount >= minHbar) return amount;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `Timed out waiting for ${minHbar} HBAR allowance on-chain (${timeoutMs / 1000}s). ` +
      "If you approved in HashPack, wait a moment and retry."
  );
}

export async function isTokenAssociated(
  ownerAccountId: string,
  tokenId: string
): Promise<boolean> {
  const res = await fetch(
    `${MIRROR_URL}/api/v1/accounts/${ownerAccountId}/tokens?token.id=${encodeURIComponent(tokenId)}`
  );
  if (!res.ok) return false;
  const data = (await res.json()) as { tokens?: unknown[] };
  return (data.tokens?.length ?? 0) > 0;
}
