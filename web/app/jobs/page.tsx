"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { useWallet } from "@/components/WalletProvider";
import { StatusBadge } from "@/components/jobs/StatusBadge";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  SortableHeader,
  StaticHeader,
} from "@/components/ui/data-table";
import { cn } from "@/lib/utils";

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

type SortKey =
  | "status"
  | "use_case"
  | "architecture"
  | "dataset"
  | "samples"
  | "created_at";

function TableActionButton({
  children,
  onClick,
  href,
  download,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  href?: string;
  download?: string;
  disabled?: boolean;
  className?: string;
}) {
  const base = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-medium transition-colors",
    disabled
      ? "cursor-not-allowed border-border/40 bg-muted/30 text-muted-foreground"
      : "border-border/60 bg-background/60 text-foreground hover:border-primary/30 hover:bg-surface hover:text-primary",
    className
  );

  if (disabled) {
    return (
      <span className={base} aria-disabled>
        {children}
      </span>
    );
  }

  if (href) {
    return (
      <a
        href={href}
        download={download}
        onClick={onClick}
        className={base}
      >
        {children}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={base}>
      {children}
    </button>
  );
}

export default function JobsPage() {
  const router = useRouter();
  const { accountId } = useWallet();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    if (!accountId) return;
    try {
      const res = await fetch(
        `/api/jobs?account_id=${encodeURIComponent(accountId)}`
      );
      if (!res.ok) throw new Error(await res.text());
      setJobs(await res.json());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [accountId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => clearInterval(t);
  }, [load]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "created_at" ? "desc" : "asc");
    }
  };

  const sortedJobs = useMemo(() => {
    const list = [...jobs];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "use_case":
          cmp = (a.use_case || "").localeCompare(b.use_case || "");
          break;
        case "architecture":
          cmp = (a.architecture_name ?? a.architecture_id ?? "").localeCompare(
            b.architecture_name ?? b.architecture_id ?? ""
          );
          break;
        case "dataset":
          cmp = (a.kaggle_dataset_ref ?? "").localeCompare(
            b.kaggle_dataset_ref ?? ""
          );
          break;
        case "samples":
          cmp = (a.train_samples ?? 0) - (b.train_samples ?? 0);
          break;
        case "created_at":
          cmp =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [jobs, sortKey, sortDir]);

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Training Jobs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your on-chain training jobs. Refreshes every 10 seconds.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error} — ensure Supabase is configured and agent is running.
        </div>
      )}

      {jobs.length > 0 ? (
        <DataTable>
          <DataTableHead>
            <SortableHeader
              label="Status"
              sortKey="status"
              current={sortKey}
              dir={sortDir}
              onClick={toggleSort}
            />
            <SortableHeader
              label="Use case"
              sortKey="use_case"
              current={sortKey}
              dir={sortDir}
              onClick={toggleSort}
            />
            <SortableHeader
              label="Architecture"
              sortKey="architecture"
              current={sortKey}
              dir={sortDir}
              onClick={toggleSort}
            />
            <SortableHeader
              label="Dataset"
              sortKey="dataset"
              current={sortKey}
              dir={sortDir}
              onClick={toggleSort}
            />
            <SortableHeader
              label="Samples"
              sortKey="samples"
              current={sortKey}
              dir={sortDir}
              onClick={toggleSort}
              align="right"
            />
            <StaticHeader label="Model" align="center" />
            <SortableHeader
              label="Created"
              sortKey="created_at"
              current={sortKey}
              dir={sortDir}
              onClick={toggleSort}
              align="right"
            />
            <StaticHeader label="Details" align="center" />
          </DataTableHead>
          <DataTableBody>
            {sortedJobs.map((job, idx) => (
              <DataTableRow
                key={job.id}
                onClick={() => router.push(`/jobs/${job.id}`)}
                className="animate-in fade-in slide-in-from-left-2"
                style={{
                  animationDelay: `${(idx % 15) * 35}ms`,
                  animationFillMode: "both",
                }}
              >
                <DataTableCell>
                  <StatusBadge status={job.status} />
                </DataTableCell>
                <DataTableCell className="max-w-[200px] truncate font-medium text-foreground">
                  {job.use_case}
                </DataTableCell>
                <DataTableCell className="text-muted-foreground">
                  {job.architecture_name ?? job.architecture_id}
                </DataTableCell>
                <DataTableCell className="max-w-[180px] truncate text-muted-foreground">
                  {job.kaggle_dataset_ref ?? "—"}
                </DataTableCell>
                <DataTableCell align="right" className="tabular-nums text-foreground">
                  {job.train_samples ?? 2}
                </DataTableCell>
                <DataTableCell align="center">
                  {job.supabase_model_url && accountId ? (
                    <TableActionButton
                      href={`/api/jobs/${job.id}/manifest?account_id=${encodeURIComponent(accountId)}`}
                      download="cpu_model_manifest.json"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </TableActionButton>
                  ) : (
                    <TableActionButton disabled>
                      Unavailable
                    </TableActionButton>
                  )}
                </DataTableCell>
                <DataTableCell
                  align="right"
                  className="whitespace-nowrap text-subtle"
                >
                  {new Date(job.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </DataTableCell>
                <DataTableCell align="center">
                  <TableActionButton
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/jobs/${job.id}`);
                    }}
                  >
                    View
                  </TableActionButton>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      ) : (
        !error && (
          <div className="rounded-2xl border border-border/50 bg-card/50 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No jobs yet. Start one from the Agent page.
            </p>
          </div>
        )
      )}
    </div>
  );
}
