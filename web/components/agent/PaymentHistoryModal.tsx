"use client";

import { X } from "lucide-react";
import { ExplorerLink } from "@/components/jobs/ExplorerLink";
import type { Ap2Payment } from "@/components/agent/types";
import { cn } from "@/lib/utils";

const REASON_LABELS: Record<string, string> = {
  chat_turn: "Chat reply",
  training_batch: "Training batch",
};

function formatReason(reason: string): string {
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

interface PaymentHistoryModalProps {
  open: boolean;
  chatTitle: string;
  payments: Ap2Payment[];
  loading?: boolean;
  onClose: () => void;
}

export function PaymentHistoryModal({
  open,
  chatTitle,
  payments,
  loading = false,
  onClose,
}: PaymentHistoryModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-[4px]"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className={cn(
          "floating-card flex max-h-[min(80vh,560px)] w-full max-w-md flex-col overflow-hidden shadow-lg",
          "animate-in fade-in zoom-in-95 duration-200"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/50 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">Payment history</h3>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{chatTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              Loading..
            </p>
          ) : payments.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              No payments recorded for this chat yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {payments.map((payment) => (
                <li
                  key={payment.id ?? payment.hedera_tx_id}
                  className="rounded-xl border border-border/50 bg-background/40 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {payment.amount_hbar.toFixed(2)} HBAR
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatReason(payment.reason)}
                      </p>
                    </div>
                    {payment.created_at ? (
                      <time
                        className="shrink-0 text-xs text-subtle"
                        dateTime={payment.created_at}
                      >
                        {new Date(payment.created_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    ) : null}
                  </div>
                  {payment.hedera_tx_id ? (
                    <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                      <ExplorerLink
                        value={payment.hedera_tx_id}
                        kind="transaction"
                        light
                        mono
                      />
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
