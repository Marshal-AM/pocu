import { describe, expect, it } from "vitest";
import { normalizeAp2Session } from "@/lib/wallet/ap2-session";

describe("normalizeAp2Session", () => {
  it("maps agent GET row id to session_id", () => {
    const s = normalizeAp2Session({
      id: "abc-123",
      status: "active",
      budget_hbar: 200,
    });
    expect(s.session_id).toBe("abc-123");
    expect(s.status).toBe("active");
  });

  it("prefers session_id when both id and session_id exist", () => {
    const s = normalizeAp2Session({
      id: "old",
      session_id: "new",
      status: "active",
    });
    expect(s.session_id).toBe("new");
  });
});
