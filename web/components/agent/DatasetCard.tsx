import type { ReactNode } from "react";
import type { KaggleDataset } from "@/components/agent/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DatasetCardProps {
  dataset: KaggleDataset;
  actions?: ReactNode;
  className?: string;
}

export function DatasetCard({ dataset, actions, className }: DatasetCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface p-4 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {dataset.title || dataset.ref}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <a
          href={`https://www.kaggle.com/datasets/${dataset.ref}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground hover:text-primary"
        >
          Kaggle
        </a>
        {actions}
      </div>
    </div>
  );
}

interface RecommendedDatasetCardProps {
  dataset: KaggleDataset;
  onStartTraining: (ref: string, title: string) => void;
  onShowAlternatives: () => void;
}

export function RecommendedDatasetCard({
  dataset,
  onStartTraining,
  onShowAlternatives,
}: RecommendedDatasetCardProps) {
  return (
    <DatasetCard
      dataset={dataset}
      className="w-full max-w-xl border-primary/25 bg-primary/5"
      actions={
        <>
          <Button
            type="button"
            size="sm"
            className="bg-accent text-accent-foreground hover:bg-accent-hover"
            onClick={() =>
              onStartTraining(dataset.ref, dataset.title || dataset.ref)
            }
          >
            Start training
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onShowAlternatives}
          >
            Other datasets
          </Button>
        </>
      }
    />
  );
}

interface DatasetGridProps {
  datasets: KaggleDataset[];
  onSelect: (ref: string, title: string) => void;
}

export function DatasetGrid({ datasets, onSelect }: DatasetGridProps) {
  return (
    <div className="flex w-full max-w-xl flex-col gap-2">
      {datasets.map((ds) => (
        <DatasetCard
          key={ds.ref}
          dataset={ds}
          actions={
            <Button
              type="button"
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent-hover"
              onClick={() => onSelect(ds.ref, ds.title || ds.ref)}
            >
              Use this
            </Button>
          }
        />
      ))}
    </div>
  );
}
