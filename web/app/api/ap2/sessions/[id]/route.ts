import { NextRequest, NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:8000";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userAccountId = req.nextUrl.searchParams.get("user_account_id") ?? "";
  const res = await fetch(
    `${AGENT_URL}/ap2/sessions/${id}?user_account_id=${encodeURIComponent(userAccountId)}`
  );
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
