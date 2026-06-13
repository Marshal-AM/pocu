import Link from "next/link";
import type { JobInfo } from "@/components/agent/types";

export function JobQueuedCard({ job }: { job: JobInfo }) {
  return (
    <div className="flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl border border-success/25 bg-success/5 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-success">Job queued</div>
        <div className="text-xs text-muted-foreground">
          {job.status ?? "pending"}
        </div>
      </div>
      <Link
        href={`/jobs/${job.job_id}`}
        className="shrink-0 text-sm text-primary hover:underline"
      >
        View
      </Link>
    </div>
  );
}
