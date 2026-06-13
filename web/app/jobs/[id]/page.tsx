"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronRight, Download, ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/jobs/StatusBadge";
import { ExplorerLink } from "@/components/jobs/ExplorerLink";
import { Skeleton } from "@/components/ui/skeleton";
import { useWallet } from "@/components/WalletProvider";
import { explorerUrl } from "@/lib/explorer";
import { cn } from "@/lib/utils";

function JobBreadcrumbs({ jobId }: { jobId: string }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/jobs" className="transition-colors hover:text-foreground">
            Jobs
          </Link>
        </li>
        <li aria-hidden className="text-border">
          /
        </li>
        <li className="font-medium text-foreground">{jobId.slice(0, 8)}…</li>
      </ol>
    </nav>
  );
}

function InfoCard({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-background/40 p-4",
        className
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div
        className={cn(
          "mt-2 text-sm text-foreground",
          mono && "break-all font-mono text-xs"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function JobLogs({ logs }: { logs: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div
      ref={containerRef}
      className="h-[400px] overflow-y-auto rounded-xl border border-border/40 bg-surface/50 p-4"
    >
      <pre className="font-mono text-xs whitespace-pre-wrap text-foreground/90">
        {logs || "Waiting for logs…"}
      </pre>
    </div>
  );
}

function ActionButton({
  children,
  href,
  download,
  disabled,
  icon: Icon,
}: {
  children: React.ReactNode;
  href?: string;
  download?: string;
  disabled?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const className = cn(
    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
    disabled
      ? "cursor-not-allowed border-border/40 bg-muted/20 text-muted-foreground"
      : "border-border/60 bg-background/60 text-foreground hover:border-primary/30 hover:bg-surface hover:text-primary"
  );

  if (disabled || !href) {
    return (
      <span className={className} aria-disabled={disabled}>
        {Icon && <Icon className="h-4 w-4 shrink-0 opacity-60" />}
        {children}
      </span>
    );
  }

  return (
    <a
      href={href}
      download={download}
      target={download ? undefined : "_blank"}
      rel={download ? undefined : "noreferrer"}
      className={className}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      {children}
    </a>
  );
}

function JobDetailSkeleton() {
  return (
    <div className="space-y-6 px-1 py-4 sm:px-2">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-14 rounded-2xl" />
    </div>
  );
}

export default function JobDetailPage() {
  const params = useParams();
  const { accountId } = useWallet();
  const id = params.id as string;
  const [job, setJob] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [onChainOpen, setOnChainOpen] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    const walletAccountId = accountId;

    async function load() {
      try {
        const res = await fetch(
          `/api/jobs/${id}?account_id=${encodeURIComponent(walletAccountId)}`
        );
        if (!res.ok) throw new Error(await res.text());
        setJob(await res.json());
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    void load();
    const intervalMs =
      job &&
      ["pending", "running", "awaiting_nft"].includes(
        String(job.status ?? "").toLowerCase()
      )
        ? 2500
        : 8000;
    const t = setInterval(() => void load(), intervalMs);
    return () => clearInterval(t);
  }, [id, accountId, job?.status]);

  if (error) {
    return (
      <div className="space-y-4 px-1 py-4 sm:px-2">
        <JobBreadcrumbs jobId={id} />
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!job) {
    return <JobDetailSkeleton />;
  }

  const hasManifest = Boolean(job.supabase_model_url);
  const status = String(job.status ?? "unknown");
  const useCase = String(job.use_case || "Training job");
  const logs = String(job.logs ?? "");
  const isActiveJob = ["pending", "running", "awaiting_nft"].includes(
    status.toLowerCase()
  );
  const showLogs = Boolean(logs) || isActiveJob;
  const onchainJobId = String(job.onchain_job_id ?? "");
  const programHash = String(job.program_hash ?? "");
  const weightsHash = String(job.weights_hash ?? "");
  const hcsTopic = String(job.hcs_topic_id ?? "");
  const ipfsUri = String(job.ipfs_uri ?? "");
  const userAccount = String(job.user_account_id ?? "");
  const ap2SessionId = String(job.ap2_session_id ?? "");
  const allowanceHbar = job.allowance_hbar != null ? String(job.allowance_hbar) : "";
  const nftToken = job.model_nft_token_id ? String(job.model_nft_token_id) : "";
  const nftSerial = job.model_nft_serial;
  const hasNft = Boolean(nftToken);
  const nftUrl =
    hasNft && nftSerial != null
      ? explorerUrl(nftToken, "nft", String(nftSerial))
      : hasNft
        ? explorerUrl(nftToken, "token")
        : null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6 px-1 py-4 duration-500 sm:px-2 md:px-3">
      <JobBreadcrumbs jobId={id} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {useCase}
          </h1>
          <StatusBadge status={status} />
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <ActionButton
            href={
              hasManifest && accountId
                ? `/api/jobs/${id}/manifest?account_id=${encodeURIComponent(accountId)}`
                : undefined
            }
            download={hasManifest ? "cpu_model_manifest.json" : undefined}
            disabled={!hasManifest}
            icon={Download}
          >
            {hasManifest ? "Download manifest" : "Manifest not available"}
          </ActionButton>
          <ActionButton href={nftUrl ?? undefined} disabled={!hasNft} icon={ExternalLink}>
            {hasNft ? "View NFT" : "NFT not available"}
          </ActionButton>
        </div>
      </div>

      <section className="floating-card overflow-hidden">
        <div className="border-b border-border/50 px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Training</h2>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <InfoCard
              label="Status"
              value={<span className="capitalize">{status}</span>}
            />
            <InfoCard
              label="Training"
              value={`${String(job.train_samples ?? 2)} samples · ${String(job.train_epochs ?? 1)} epoch(s)`}
            />
            <InfoCard
              label="Architecture"
              value={`${String(job.architecture_name ?? job.architecture_id)} (${String(job.architecture_tier)})`}
            />
            <InfoCard
              label="Kaggle"
              value={
                job.kaggle_url ? (
                  <a
                    href={String(job.kaggle_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {String(job.kaggle_dataset_ref)}
                  </a>
                ) : (
                  "—"
                )
              }
            />
            <InfoCard
              label="Target column"
              value={String(job.target_column ?? "—")}
            />
            {job.error_message ? (
              <InfoCard
                label="Error"
                value={
                  <span className="text-destructive">
                    {String(job.error_message)}
                  </span>
                }
              />
            ) : null}
          </div>

          <div className="rounded-xl border border-border/50 bg-background/40 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              User prompt
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {String(job.user_prompt || "—")}
            </p>
          </div>
        </div>
      </section>

      <section className="floating-card overflow-hidden">
        <button
          type="button"
          onClick={() => setOnChainOpen((o) => !o)}
          className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-surface/30"
          aria-expanded={onChainOpen}
        >
          <div>
            <h2 className="text-sm font-semibold text-foreground">On-chain</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Hashes, topics, accounts, and session metadata
            </p>
          </div>
          {onChainOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>

        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            onChainOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="overflow-hidden">
            <div className="grid gap-3 border-t border-border/50 p-5 sm:grid-cols-2">
              <InfoCard
                label="Job ID"
                value={onchainJobId && onchainJobId !== "—" ? onchainJobId : "—"}
                mono
              />
              <InfoCard
                label="Program hash"
                value={programHash && programHash !== "—" ? programHash : "—"}
                mono
              />
              <InfoCard
                label="Weights hash"
                value={weightsHash && weightsHash !== "—" ? weightsHash : "—"}
                mono
              />
              <InfoCard
                label="HCS topic"
                value={
                  hcsTopic && hcsTopic !== "—" ? (
                    <ExplorerLink value={hcsTopic} kind="topic" light />
                  ) : (
                    "—"
                  )
                }
              />
              <InfoCard
                label="IPFS"
                value={
                  ipfsUri && ipfsUri !== "—" ? (
                    <ExplorerLink value={ipfsUri} kind="ipfs" light mono />
                  ) : (
                    "—"
                  )
                }
              />
              <InfoCard
                label="User account"
                value={
                  userAccount && userAccount !== "—" ? (
                    <ExplorerLink value={userAccount} kind="account" light mono />
                  ) : (
                    "—"
                  )
                }
              />
              <InfoCard
                label="AP2 session"
                value={
                  ap2SessionId && ap2SessionId !== "—" ? (
                    ap2SessionId
                  ) : (
                    <span className="text-destructive">
                      Not linked — re-authorize and queue a new job
                    </span>
                  )
                }
                mono
              />
              <InfoCard
                label="Allowance cap"
                value={allowanceHbar ? `${allowanceHbar} HBAR` : "—"}
              />
            </div>
          </div>
        </div>
      </section>

      {showLogs ? (
        <section className="floating-card overflow-hidden">
          <div className="border-b border-border/50 px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">Logs</h2>
          </div>
          <div className="p-5">
            <JobLogs logs={logs} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
