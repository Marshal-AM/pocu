"use client";

import { CHAT_TURN_HBAR, SESSION_BUDGET_HBAR } from "@/lib/wallet/config";
import { cn } from "@/lib/utils";

interface Ap2AuthorizeOverlayProps {
  loading: boolean;
  statusMessage: string | null;
  errorMessage?: string | null;
  onAuthorize: () => void;
  onCancel: () => void;
}

export function Ap2AuthorizeOverlay({
  loading,
  statusMessage,
  errorMessage,
  onAuthorize,
  onCancel,
}: Ap2AuthorizeOverlayProps) {
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/60 p-6 backdrop-blur-[4px]"
      aria-modal="true"
      role="dialog"
    >
      <div
        className={cn(
          "floating-card w-full max-w-sm p-6 shadow-lg",
          "animate-in fade-in zoom-in-95 duration-200"
        )}
      >
        <h3 className="text-base font-semibold text-foreground">
          Authorize session
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Approve a {SESSION_BUDGET_HBAR} HBAR allowance in HashPack to chat and
          train. Each reply costs {CHAT_TURN_HBAR} HBAR.
        </p>

        {statusMessage && (
          <p className="mt-3 text-sm text-muted-foreground">{statusMessage}</p>
        )}
        {errorMessage && (
          <p className="mt-3 text-sm text-destructive">{errorMessage}</p>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-full border border-border/60 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAuthorize}
            disabled={loading}
            className="flex-1 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "Authorizing…" : "Authorize"}
          </button>
        </div>
      </div>
    </div>
  );
}
