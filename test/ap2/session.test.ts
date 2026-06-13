import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { gasCostHbarFromWei, hbarToTinybars } from "../../src/protocols/ap2-settle";

describe("AP2 batch settle helpers", () => {
  it("converts wei gas to tinybars", () => {
    const wei = 1_000_000_000_000_000n;
    const hbar = gasCostHbarFromWei(wei);
    expect(hbarToTinybars(hbar)).toBeGreaterThan(0);
  });
});

describe("settleBatchViaAgent request shape", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ hedera_tx_id: "0.0.1@2.3", amount_hbar: 0.01 }),
    });
    process.env.AGENT_SERVICE_URL = "http://127.0.0.1:8000";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs amount_tinybars and training_batch reason", async () => {
    const { settleBatchViaAgent } = await import("../../src/protocols/ap2-settle");
    await settleBatchViaAgent({
      sessionId: "sess-abc",
      batchIndex: 3,
      receipt: { gasUsed: 100_000n, gasPrice: 1_000_000_000n },
      jobId: "job-1",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8000/ap2/sessions/sess-abc/settle");
    const body = JSON.parse(String(init.body));
    expect(body.reason).toBe("training_batch_3");
    expect(body.amount_tinybars).toBeGreaterThan(0);
    expect(body.job_id).toBe("job-1");
  });
});
