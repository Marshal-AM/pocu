import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@hiero-ledger/sdk", () => ({
  AccountAllowanceApproveTransaction: class {
    approveHbarAllowance() {
      return this;
    }
    setTransactionMemo() {
      return this;
    }
  },
  AccountId: { fromString: (id: string) => id },
  Hbar: { from: (n: number) => n },
  HbarUnit: { Hbar: "HBAR" },
}));

vi.mock("@/lib/wallet/config", () => ({
  ALLOWANCE_HBAR: 200,
  CHAT_TURN_HBAR: 0.1,
  requireWalletConfig: () => ({ agentAccountId: "0.0.6111100", modelNftTokenId: "0.0.1" }),
}));

const fetchHbarAllowance = vi.fn();
const waitForHbarAllowance = vi.fn();
vi.mock("@/lib/wallet/mirror", () => ({
  fetchHbarAllowance: (...args: unknown[]) => fetchHbarAllowance(...args),
  waitForHbarAllowance: (...args: unknown[]) => waitForHbarAllowance(...args),
  isTokenAssociated: vi.fn().mockResolvedValue(true),
}));

const walletSignAndExecute = vi.fn();
vi.mock("@/lib/wallet/wallet-tx", () => ({
  walletSignAndExecute: (...args: unknown[]) => walletSignAndExecute(...args),
  pauseBetweenWalletSteps: vi.fn().mockResolvedValue(undefined),
}));

describe("ensureAllowanceTxId", () => {
  beforeEach(() => {
    fetchHbarAllowance.mockReset();
    waitForHbarAllowance.mockReset();
    walletSignAndExecute.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it("skips wallet when remaining allowance can fund a chat turn", async () => {
    fetchHbarAllowance.mockResolvedValue(50);

    const { ensureAllowanceTxId } = await import("@/lib/wallet/ap2-session");
    const result = await ensureAllowanceTxId("0.0.9211283", { openWallet: true });
    expect(result).toBe("existing_allowance");
    expect(walletSignAndExecute).not.toHaveBeenCalled();
    expect(waitForHbarAllowance).not.toHaveBeenCalled();
  });

  it("never opens wallet when openWallet is false even if allowance is low", async () => {
    fetchHbarAllowance.mockResolvedValue(0);

    const { ensureAllowanceTxId } = await import("@/lib/wallet/ap2-session");
    await expect(
      ensureAllowanceTxId("0.0.9211283", { openWallet: false })
    ).rejects.toThrow(/Insufficient HBAR allowance/);
    expect(walletSignAndExecute).not.toHaveBeenCalled();
  });

  it("opens wallet when allowance is missing and openWallet is true", async () => {
    fetchHbarAllowance.mockResolvedValue(0);
    walletSignAndExecute.mockResolvedValue("0.0.9211283@1.2");
    waitForHbarAllowance.mockReturnValue(new Promise(() => {}));

    const { ensureAllowanceTxId } = await import("@/lib/wallet/ap2-session");
    const result = await ensureAllowanceTxId("0.0.9211283", { openWallet: true });
    expect(result).toBe("0.0.9211283@1.2");
    expect(walletSignAndExecute).toHaveBeenCalledOnce();
  });

  it("falls back to mirror_confirmed when wallet fails but allowance appears", async () => {
    fetchHbarAllowance.mockResolvedValueOnce(0).mockResolvedValueOnce(0.5);
    walletSignAndExecute.mockRejectedValue(new Error("wallet timeout"));
    waitForHbarAllowance.mockResolvedValue(200);

    const { ensureAllowanceTxId } = await import("@/lib/wallet/ap2-session");
    const result = await ensureAllowanceTxId("0.0.9211283", { openWallet: true });
    expect(result).toBe("mirror_confirmed");
    expect(walletSignAndExecute).toHaveBeenCalledOnce();
  });
});
