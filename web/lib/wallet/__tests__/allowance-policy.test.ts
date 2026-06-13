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

describe("approveAp2Allowance", () => {
  beforeEach(() => {
    fetchHbarAllowance.mockReset();
    waitForHbarAllowance.mockReset();
    walletSignAndExecute.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it("skips wallet when mirror already shows sufficient allowance", async () => {
    fetchHbarAllowance.mockResolvedValue(200);
    const { approveAp2Allowance } = await import("@/lib/wallet/ap2-session");
    const result = await approveAp2Allowance("0.0.9211283");
    expect(result).toBe("existing_allowance");
    expect(walletSignAndExecute).not.toHaveBeenCalled();
    expect(waitForHbarAllowance).not.toHaveBeenCalled();
  });

  it("returns mirror_confirmed when mirror poll wins the race", async () => {
    fetchHbarAllowance.mockResolvedValue(0);
    walletSignAndExecute.mockReturnValue(new Promise(() => {}));
    waitForHbarAllowance.mockResolvedValue(200);

    const { approveAp2Allowance } = await import("@/lib/wallet/ap2-session");
    const result = await approveAp2Allowance("0.0.9211283");
    expect(result).toBe("mirror_confirmed");
    expect(walletSignAndExecute).toHaveBeenCalledOnce();
    expect(waitForHbarAllowance).toHaveBeenCalledOnce();
  });

  it("returns wallet tx id when wallet resolves first", async () => {
    fetchHbarAllowance.mockResolvedValue(0);
    walletSignAndExecute.mockResolvedValue("0.0.9211283@1.2");
    waitForHbarAllowance.mockReturnValue(new Promise(() => {}));

    const { approveAp2Allowance } = await import("@/lib/wallet/ap2-session");
    const result = await approveAp2Allowance("0.0.9211283");
    expect(result).toBe("0.0.9211283@1.2");
  });
});
