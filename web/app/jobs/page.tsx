"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Job {
  id: string;
  status: string;
  use_case: string;
  architecture_name: string;
  architecture_id: string;
  kaggle_dataset_ref: string;
  train_samples: number;
  supabase_model_url: string | null;
  created_at: string;
}

function statusColor(status: string): string {
  if (status === "completed") return "var(--success)";
  if (status === "failed") return "var(--danger)";
  if (status === "running") return "var(--warn)";
  return "var(--muted)";
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) throw new Error(await res.text());
      setJobs(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Training jobs</h1>
      {error && (
        <p style={{ color: "var(--danger)" }}>
          {error} — ensure Supabase is configured and agent is running.
        </p>
      )}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.9rem",
        }}
      >
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
            <th style={{ padding: "0.5rem" }}>Status</th>
            <th style={{ padding: "0.5rem" }}>Use case</th>
            <th style={{ padding: "0.5rem" }}>Architecture</th>
            <th style={{ padding: "0.5rem" }}>Dataset</th>
            <th style={{ padding: "0.5rem" }}>Samples</th>
            <th style={{ padding: "0.5rem" }}>Model</th>
            <th style={{ padding: "0.5rem" }}>Created</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "0.5rem", color: statusColor(j.status) }}>
                <Link href={`/jobs/${j.id}`}>{j.status}</Link>
              </td>
              <td style={{ padding: "0.5rem" }}>{j.use_case}</td>
              <td style={{ padding: "0.5rem" }}>{j.architecture_name ?? j.architecture_id}</td>
              <td style={{ padding: "0.5rem", fontSize: "0.8rem" }}>
                {j.kaggle_dataset_ref ?? "—"}
              </td>
              <td style={{ padding: "0.5rem" }}>{j.train_samples ?? 2}</td>
              <td style={{ padding: "0.5rem" }}>
                {j.supabase_model_url ? (
                  <a href={`/api/jobs/${j.id}/manifest`} download="cpu_model_manifest.json">
                    download
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td style={{ padding: "0.5rem", color: "var(--muted)", fontSize: "0.8rem" }}>
                {new Date(j.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {jobs.length === 0 && !error && (
        <p style={{ color: "var(--muted)" }}>No jobs yet. Start one from the Agent page.</p>
      )}
    </div>
  );
}
