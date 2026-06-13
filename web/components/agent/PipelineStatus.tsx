import { Progress } from "@/components/ui/progress";

interface PipelineStatusProps {
  message: string;
  progressPct?: number;
}

export function PipelineStatus({ message, progressPct }: PipelineStatusProps) {
  const shortMessage =
    message.length > 72 ? `${message.slice(0, 72)}…` : message;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate">{shortMessage}</span>
        {progressPct != null && (
          <span className="shrink-0 text-primary">{progressPct}%</span>
        )}
      </div>
      {progressPct != null && (
        <Progress
          value={progressPct}
          className="h-1 bg-surface [&_[data-slot=progress-indicator]]:bg-primary"
        />
      )}
    </div>
  );
}
