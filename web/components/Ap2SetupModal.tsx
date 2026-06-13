"use client";

import { Button } from "@/components/ui/button";
import {
  SESSION_BUDGET_HBAR,
  CHAT_TURN_HBAR,
} from "@/lib/wallet/config";

interface Ap2SetupModalProps {
  open: boolean;
  loading: boolean;
  statusMessage: string | null;
  errorMessage?: string | null;
  onAuthorize: () => void;
  onCancel?: () => void;
}

export function Ap2SetupModal({
  open,
  loading,
  statusMessage,
  errorMessage,
  onAuthorize,
  onCancel,
}: Ap2SetupModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Authorize AP2 session</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          HashPack will open first so you can approve the {SESSION_BUDGET_HBAR} HBAR
          allowance for this session. After that, the agent activates your AP2 mandate.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          <li>Session budget: up to {SESSION_BUDGET_HBAR} HBAR</li>
          <li>Each agent reply: {CHAT_TURN_HBAR} HBAR</li>
          <li>Training batches: actual on-chain gas (metered per batch)</li>
          <li>Payment rail: HIP-745 HBAR allowance via HashPack</li>
        </ul>
        {statusMessage ? (
          <p className="mt-4 text-sm text-muted-foreground">{statusMessage}</p>
        ) : null}
        {errorMessage ? (
          <p className="mt-3 text-sm text-destructive">{errorMessage}</p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          {onCancel ? (
            <Button variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
          ) : null}
          <Button onClick={onAuthorize} disabled={loading}>
            {loading ? "Authorizing…" : "Authorize session"}
          </Button>
        </div>
      </div>
    </div>
  );
}
