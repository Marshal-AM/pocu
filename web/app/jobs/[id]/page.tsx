"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function JobDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [job, setJob] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (!res.ok) throw new Error(await res.text());
        setJob(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [id]);

  if (error) {
    return (
      <p style={{ color: "var(--danger)" }}>
        {error} <Link href="/jobs">Back to jobs</Link>
      </p>
    );
  }

  if (!job) {
    return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  }

  const hasManifest = Boolean(job.supabase_model_url);

  return (
    <div>
      <p>
        <Link href="/jobs">← Jobs</Link>
      </p>
      <h1 style={{ marginTop: "0.5rem" }}>Job {id.slice(0, 8)}…</h1>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "160px 1fr",
          gap: "0.5rem 1rem",
          fontSize: "0.9rem",
        }}
      >
        <dt style={{ color: "var(--muted)" }}>Status</dt>
        <dd>{String(job.status)}</dd>
        <dt style={{ color: "var(--muted)" }}>Use case</dt>
        <dd>{String(job.use_case)}</dd>
        <dt style={{ color: "var(--muted)" }}>User prompt</dt>
        <dd>{String(job.user_prompt || "—")}</dd>
        <dt style={{ color: "var(--muted)" }}>Training</dt>
        <dd>
          {String(job.train_samples ?? 2)} samples · {String(job.train_epochs ?? 1)} epoch(s)
        </dd>
        <dt style={{ color: "var(--muted)" }}>Architecture</dt>
        <dd>
          {String(job.architecture_name ?? job.architecture_id)} ({String(job.architecture_tier)})
        </dd>
        <dt style={{ color: "var(--muted)" }}>Kaggle</dt>
        <dd>
          {job.kaggle_url ? (
            <a href={String(job.kaggle_url)} target="_blank" rel="noreferrer">
              {String(job.kaggle_dataset_ref)}
            </a>
          ) : (
            "—"
          )}
        </dd>
        <dt style={{ color: "var(--muted)" }}>Target column</dt>
        <dd>{String(job.target_column ?? "—")}</dd>
        <dt style={{ color: "var(--muted)" }}>On-chain job ID</dt>
        <dd style={{ wordBreak: "break-all" }}>{String(job.onchain_job_id ?? "—")}</dd>
        <dt style={{ color: "var(--muted)" }}>Program hash</dt>
        <dd style={{ wordBreak: "break-all" }}>{String(job.program_hash ?? "—")}</dd>
        <dt style={{ color: "var(--muted)" }}>Weights hash</dt>
        <dd style={{ wordBreak: "break-all" }}>{String(job.weights_hash ?? "—")}</dd>
        <dt style={{ color: "var(--muted)" }}>HCS topic</dt>
        <dd>{String(job.hcs_topic_id ?? "—")}</dd>
        <dt style={{ color: "var(--muted)" }}>IPFS</dt>
        <dd style={{ wordBreak: "break-all" }}>{String(job.ipfs_uri ?? "—")}</dd>
        <dt style={{ color: "var(--muted)" }}>User account</dt>
        <dd>{String(job.user_account_id ?? "—")}</dd>
        <dt style={{ color: "var(--muted)" }}>ACP order</dt>
        <dd>
          {String(job.acp_order_id ?? "—")}
          {job.acp_status ? ` · ${String(job.acp_status)}` : ""}
          {job.acp_progress_pct != null ? ` (${String(job.acp_progress_pct)}%)` : ""}
        </dd>
        <dt style={{ color: "var(--muted)" }}>Model NFT</dt>
        <dd>
          {job.model_nft_token_id
            ? `${String(job.model_nft_token_id)} #${String(job.model_nft_serial ?? "?")}`
            : "—"}
        </dd>
        <dt style={{ color: "var(--muted)" }}>Total spent (MPP)</dt>
        <dd>{job.total_spent_hbar != null ? `${String(job.total_spent_hbar)} HBAR` : "—"}</dd>
        <dt style={{ color: "var(--muted)" }}>Model file</dt>
        <dd>
          {hasManifest ? (
            <a href={`/api/jobs/${id}/manifest`} download="cpu_model_manifest.json">
              Download manifest
            </a>
          ) : (
            "Pending…"
          )}
        </dd>
        {job.error_message ? (
          <>
            <dt style={{ color: "var(--danger)" }}>Error</dt>
            <dd style={{ color: "var(--danger)" }}>{String(job.error_message)}</dd>
          </>
        ) : null}
      </dl>
      {job.logs ? (
        <pre
          style={{
            marginTop: "1.5rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "1rem",
            overflow: "auto",
            maxHeight: 400,
            fontSize: "0.75rem",
          }}
        >
          {String(job.logs)}
        </pre>
      ) : null}
    </div>
  );
}
