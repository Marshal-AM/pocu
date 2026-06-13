/**
 * Integration smoke test for AP2 authorize backend (agent must be running on :8000).
 * Run: node scripts/test-ap2-authorize-flow.mjs
 */
const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:8000";
const USER = process.env.TEST_USER_ACCOUNT_ID ?? "0.0.9211283";

async function post(path, body) {
  const res = await fetch(`${AGENT_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  console.log("[test-ap2] health check…");
  const health = await fetch(`${AGENT_URL}/health`, { signal: AbortSignal.timeout(5_000) });
  if (!health.ok) throw new Error(`Agent not healthy: ${health.status}`);

  console.log("[test-ap2] create thread…");
  const thread = await post("/threads", {
    title: "AP2 authorize test",
    use_case: "test",
    architecture_id: "",
    user_account_id: USER,
  });

  console.log("[test-ap2] create AP2 session…");
  const pending = await post("/ap2/sessions", {
    thread_id: thread.id,
    user_account_id: USER,
    intent: "AP2 authorize flow test",
  });
  if (pending.status !== "pending") {
    throw new Error(`Expected pending session, got ${pending.status}`);
  }

  console.log("[test-ap2] activate session…");
  const active = await post(`/ap2/sessions/${pending.session_id}/activate`, {
    user_account_id: USER,
    allowance_tx_id: "existing_allowance",
  });
  if (active.status !== "active") {
    throw new Error(`Expected active session, got ${active.status}`);
  }

  console.log("[test-ap2] OK", {
    thread_id: thread.id,
    session_id: active.session_id,
    remaining_hbar: active.remaining_hbar,
  });
}

main().catch((e) => {
  console.error("[test-ap2] FAILED:", e.message ?? e);
  process.exit(1);
});
