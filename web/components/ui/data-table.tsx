"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DataTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-surface shadow-sm",
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">{children}</table>
      </div>
    </div>
  );
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-border bg-background/40 text-[11px] font-medium uppercase tracking-wider text-subtle">
        {children}
      </tr>
    </thead>
  );
}

export function DataTableBody({ children }: { children: ReactNode }) {
  return (
    <tbody className="divide-y divide-border/60 text-[13px]">{children}</tbody>
  );
}

export function DataTableRow({
  children,
  onClick,
  className,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition-colors duration-200",
        onClick &&
          "cursor-pointer hover:bg-surface/30 hover:text-foreground",
        className
      )}
      style={style}
    >
      {children}
    </tr>
  );
}

export function DataTableCell({
  children,
  className,
  align = "left",
}: {
  children: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      className={cn(
        "px-6 py-4",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className
      )}
    >
      {children}
    </td>
  );
}

export function SortableHeader<T extends string>({
  label,
  sortKey,
  current,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  sortKey: T;
  current: T;
  dir: "asc" | "desc";
  onClick: (key: T) => void;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={cn(
        "cursor-pointer select-none px-6 py-4 font-medium transition-colors hover:text-foreground",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left"
      )}
      onClick={() => onClick(sortKey)}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1",
          align === "right" && "flex-row-reverse"
        )}
      >
        {label}
        <span
          className={cn(
            "text-[9px]",
            current === sortKey ? "opacity-100" : "opacity-0"
          )}
        >
          {dir === "asc" ? "▲" : "▼"}
        </span>
      </span>
    </th>
  );
}

export function StaticHeader({
  label,
  align = "left",
}: {
  label: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={cn(
        "px-6 py-4 font-medium",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left"
      )}
    >
      {label}
    </th>
  );
}
