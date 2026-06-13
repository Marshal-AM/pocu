import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@hiero-ledger/sdk", () => ({
  AccountAllowanceApproveTransaction: class {},
  AccountId: { fromString: (s: string) => s },
  Hbar: { from: () => ({}) },
  HbarUnit: { Hbar: "HBAR" },
  TokenAssociateTransaction: class {},
  TokenId: { fromString: (s: string) => s },
}));

const fetchHbarAllowance = vi.fn();
const isTokenAssociated = vi.fn();

vi.mock("@/lib/wallet/mirror", () => ({
  fetchHbarAllowance: (...args: unknown[]) => fetchHbarAllowance(...args),
  isTokenAssociated: (...args: unknown[]) => isTokenAssociated(...args),
  waitForHbarAllowance: vi.fn(),
}));

vi.mock("@/lib/wallet/config", () => ({
  ALLOWANCE_HBAR: 200,
  CHAT_TURN_HBAR: 0.1,
  SESSION_BUDGET_HBAR: 200,
  requireWalletConfig: () => ({
    projectId: "test",
    agentAccountId: "0.0.123",
    network: "testnet" as const,
    modelNftTokenId: "0.0.456",
  }),
  assertWalletConfigMatchesAgent: vi.fn(),
}));

vi.mock("@/lib/wallet/wallet-tx", () => ({
  pauseBetweenWalletSteps: vi.fn(),
  walletSignAndExecute: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockAp2Fetches(session: Record<string, unknown>) {
  mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/ap2/config")) {
      return {
        ok: true,
        json: async () => ({
          agent_account_id: "0.0.123",
          model_nft_token_id: "0.0.456",
          allowance_hbar: 200,
        }),
      };
    }
    if (url.includes("/api/ap2/sessions/")) {
      return {
        ok: true,
        status: 200,
        json: async () => session,
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe("ensureAp2ReadyForTraining", () => {
  beforeEach(() => {
    fetchHbarAllowance.mockReset();
    isTokenAssociated.mockReset();
    mockFetch.mockReset();
    isTokenAssociated.mockResolvedValue(true);
  });

  it(
    "allows chat/train when on-chain allowance is below original cap but above turn cost",
    async () => {
    mockAp2Fetches({
      session_id: "sess-1",
      status: "active",
      budget_hbar: 200,
      remaining_hbar: 199.9,
    });
    fetchHbarAllowance.mockResolvedValue(199.9);

    const { ensureAp2ReadyForTraining } = await import("@/lib/wallet/ap2-session");
    const result = await ensureAp2ReadyForTraining({
      userAccountId: "0.0.999",
      session: { session_id: "sess-1", status: "active" },
    });

    expect(result.session_id).toBe("sess-1");
    expect(result.remaining_hbar).toBe(199.9);
  },
    15_000
  );

  it("rejects when on-chain allowance cannot cover another chat turn", async () => {
    mockAp2Fetches({
      session_id: "sess-1",
      status: "active",
      budget_hbar: 200,
      remaining_hbar: 199.9,
    });
    fetchHbarAllowance.mockResolvedValue(0.05);

    const { ensureAp2ReadyForTraining } = await import("@/lib/wallet/ap2-session");
    await expect(
      ensureAp2ReadyForTraining({
        userAccountId: "0.0.999",
        session: { session_id: "sess-1", status: "active" },
      })
    ).rejects.toThrow(/Insufficient HBAR allowance/);
  });

  it("rejects when session budget is exhausted", async () => {
    mockAp2Fetches({
      session_id: "sess-1",
      status: "active",
      budget_hbar: 200,
      remaining_hbar: 0.05,
    });
    fetchHbarAllowance.mockResolvedValue(0.05);

    const { ensureAp2ReadyForTraining } = await import("@/lib/wallet/ap2-session");
    await expect(
      ensureAp2ReadyForTraining({
        userAccountId: "0.0.999",
        session: { session_id: "sess-1", status: "active" },
      })
    ).rejects.toThrow(/Session budget exhausted/);
  });
});
