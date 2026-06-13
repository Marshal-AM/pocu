import type { Architecture } from "@/components/agent/types";
import { cn } from "@/lib/utils";

interface ConfigSummaryProps {
  useCase: string;
  architectureId: string;
  selectedArch?: Architecture;
  className?: string;
}

export function ConfigSummary({
  useCase,
  architectureId,
  selectedArch,
  className,
}: ConfigSummaryProps) {
  if (!useCase && !architectureId) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {useCase && (
        <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-muted-foreground">
          {useCase}
        </span>
      )}
      {selectedArch && (
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
          {selectedArch.name}
        </span>
      )}
    </div>
  );
}
