import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:8000";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobRes = await fetch(`${AGENT_URL}/jobs/${id}`, { cache: "no-store" });
  if (!jobRes.ok) {
    return new NextResponse(await jobRes.text(), { status: jobRes.status });
  }

  const job = (await jobRes.json()) as { supabase_model_url?: string | null };
  const url = job.supabase_model_url;
  if (!url) {
    return NextResponse.json({ error: "Manifest not available yet" }, { status: 404 });
  }

  const fileRes = await fetch(url, { cache: "no-store" });
  if (!fileRes.ok) {
    return NextResponse.json({ error: "Failed to fetch manifest from storage" }, { status: 502 });
  }

  const body = await fileRes.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="cpu_model_manifest.json"',
      "Cache-Control": "private, no-cache",
    },
  });
}
