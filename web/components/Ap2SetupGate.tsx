"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Ap2SetupModal } from "./Ap2SetupModal";

interface Ap2SetupGateProps {
  children: ReactNode;
  sessionActive: boolean;
  showSetup: boolean;
  setupLoading: boolean;
  setupStatus: string | null;
  onAuthorize: () => void;
  onOpenSetup: () => void;
  onDismissSetup?: () => void;
}

export function Ap2SetupGate({
  children,
  sessionActive,
  showSetup,
  setupLoading,
  setupStatus,
  onAuthorize,
  onOpenSetup,
  onDismissSetup,
}: Ap2SetupGateProps) {
  const blocked = !sessionActive;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Ap2SetupModal
        open={showSetup}
        loading={setupLoading}
        statusMessage={setupStatus}
        onAuthorize={onAuthorize}
        onCancel={onDismissSetup}
      />
      <div className={blocked ? "min-h-0 flex-1 pointer-events-none opacity-60" : "min-h-0 flex-1"}>
        {children}
      </div>
      {blocked ? (
        <div className="border-t border-accent/30 bg-accent/5 px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-foreground">
                AP2 session required
              </p>
              <p className="text-sm text-muted-foreground">
                Authorize a payment session (200 HBAR budget, 0.1 HBAR per reply) before
                you can chat or start training.
              </p>
            </div>
            <Button
              type="button"
              className="shrink-0"
              disabled={setupLoading}
              onClick={showSetup ? onAuthorize : onOpenSetup}
            >
              {setupLoading ? "Authorizing…" : "Authorize AP2 session"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
