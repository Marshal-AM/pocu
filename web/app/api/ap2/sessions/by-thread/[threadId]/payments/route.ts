import { NextRequest, NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:8000";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const accountId = req.nextUrl.searchParams.get("user_account_id")?.trim();
  if (!accountId) {
    return NextResponse.json({ error: "user_account_id is required" }, { status: 400 });
  }
  const res = await fetch(
    `${AGENT_URL}/ap2/sessions/by-thread/${threadId}/payments?user_account_id=${encodeURIComponent(accountId)}`,
    { cache: "no-store" }
  );
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
