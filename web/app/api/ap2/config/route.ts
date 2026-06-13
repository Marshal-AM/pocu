import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:8000";
const UPSTREAM_TIMEOUT_MS = 15_000;

export async function GET() {
  try {
    const res = await fetch(`${AGENT_URL}/ap2/config`, {
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Cannot reach agent for AP2 config: ${msg}` },
      { status: 502 }
    );
  }
}
