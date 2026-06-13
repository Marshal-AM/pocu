"use client";

import { cn } from "@/lib/utils";

interface Ap2AuthorizeOverlayProps {
  loading: boolean;
  statusMessage: string | null;
  errorMessage?: string | null;
  onAuthorize: () => void;
}

export function Ap2AuthorizeOverlay({
  loading,
  statusMessage,
  errorMessage,
  onAuthorize,
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
          Approve this session in HashPack to initialize an AP2 session for this
          chat.
        </p>

        {(loading || statusMessage) && (
          <p className="mt-3 text-sm text-muted-foreground">
            {loading ? "Loading.." : statusMessage}
          </p>
        )}
        {errorMessage && (
          <p className="mt-3 text-sm text-destructive">{errorMessage}</p>
        )}

        <div className="mt-6">
          <button
            type="button"
            onClick={onAuthorize}
            disabled={loading}
            className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "Loading.." : "Authorize"}
          </button>
        </div>
      </div>
    </div>
  );
}
