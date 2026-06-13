"use client";

import type { Architecture } from "@/components/agent/types";
import { UseCaseChips } from "@/components/agent/UseCasePanel";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface SetupPanelProps {
  useCase: string;
  agentPickedUseCase: boolean;
  agentPickedArch: boolean;
  tierFilter: string;
  architectureId: string;
  architectures: Architecture[];
  selectedArch?: Architecture;
  onUseCaseChange: (value: string) => void;
  onClearUseCase: () => void;
  onPresetSelect: (preset: string) => void;
  onTierFilterChange: (tier: string) => void;
  onArchitectureSelect: (id: string) => void;
  onClearArchitecture: () => void;
  className?: string;
}

function SectionHeader({
  label,
  onClear,
  showClear,
}: {
  label: string;
  onClear?: () => void;
  showClear?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {showClear && onClear && (
        <button
          type="button"
          className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          onClick={onClear}
        >
          Clear
        </button>
      )}
    </div>
  );
}

export function SetupPanel({
  useCase,
  agentPickedUseCase,
  agentPickedArch,
  tierFilter,
  architectureId,
  architectures,
  selectedArch,
  onUseCaseChange,
  onClearUseCase,
  onPresetSelect,
  onTierFilterChange,
  onArchitectureSelect,
  onClearArchitecture,
  className,
}: SetupPanelProps) {
  const filtered = architectures.filter(
    (a) => !tierFilter || a.tier === tierFilter
  );

  return (
    <div
      className={cn(
        "floating-card flex h-full min-h-0 w-72 flex-col overflow-hidden",
        className
      )}
    >
      <div className="shrink-0 border-b border-border/50 px-4 py-3.5">
        <h3 className="text-sm font-medium text-foreground">Setup</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Optional — the agent can infer these.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
        <section className="space-y-3 rounded-xl border border-border/40 bg-surface/40 p-3">
          <SectionHeader
            label="Use case"
            showClear={Boolean(useCase)}
            onClear={onClearUseCase}
          />
          <Input
            placeholder="What do you want to build?"
            value={useCase}
            onChange={(e) => onUseCaseChange(e.target.value)}
            className="h-9 border-border/50 bg-background/60 text-sm shadow-none"
          />
          {agentPickedUseCase && useCase && (
            <p className="text-[11px] text-primary">Set by agent</p>
          )}
          <div className="border-t border-border/30 pt-3">
            <p className="mb-2 text-[11px] text-muted-foreground">Quick picks</p>
            <UseCaseChips
              useCase={useCase}
              agentPickedUseCase={agentPickedUseCase}
              onSelect={onPresetSelect}
            />
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border/40 bg-surface/40 p-3">
          <SectionHeader
            label="Architecture"
            showClear={Boolean(architectureId)}
            onClear={onClearArchitecture}
          />
          <div className="flex rounded-lg border border-border/50 bg-background/60 p-0.5">
            {["", "low", "mid"].map((t) => (
              <button
                key={t || "all"}
                type="button"
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-medium capitalize transition-colors",
                  tierFilter === t
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => onTierFilterChange(t)}
              >
                {t || "All"}
              </button>
            ))}
          </div>
          <Select
            value={architectureId || "none"}
            onValueChange={(v) => v !== "none" && onArchitectureSelect(v)}
          >
            <SelectTrigger className="h-9 border-border/50 bg-background/60 text-sm shadow-none">
              <SelectValue placeholder="Select architecture" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select architecture…</SelectItem>
              {filtered.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} · {a.tier}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedArch && agentPickedArch && (
            <p className="text-[11px] text-muted-foreground">Picked by agent</p>
          )}
        </section>
      </div>
    </div>
  );
}
