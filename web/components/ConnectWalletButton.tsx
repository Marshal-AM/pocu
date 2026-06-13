"use client";

import { useWallet } from "./WalletProvider";
import { hashscanAccount, isHederaEntityId } from "@/lib/explorer";

export function ConnectWalletButton() {
  const { accountId, connecting, connect, disconnect } = useWallet();

  if (accountId) {
    const explorerHref = isHederaEntityId(accountId)
      ? hashscanAccount(accountId)
      : undefined;

    return (
      <div className="flex items-center gap-2 text-sm">
        <div className="rounded-full border border-border/50 bg-surface px-4 py-2 font-mono text-xs text-foreground">
          {explorerHref ? (
            <a
              href={explorerHref}
              target="_blank"
              rel="noreferrer"
              className="max-w-[140px] truncate hover:underline sm:max-w-none"
            >
              {accountId}
            </a>
          ) : (
            <span className="truncate">{accountId}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void disconnect()}
          className="rounded-full border border-border/50 px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={connecting}
      onClick={() => void connect().catch(() => {})}
      className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
    >
      {connecting ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
