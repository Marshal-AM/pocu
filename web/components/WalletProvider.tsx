"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Ap2SessionState } from "@/lib/wallet/ap2-session";
import { normalizeAp2Session } from "@/lib/wallet/ap2-session";
import {
  connectWallet,
  disconnectWallet,
  restoreWalletSession,
} from "@/lib/wallet/hedera-wallet";

interface WalletContextValue {
  accountId: string | null;
  connecting: boolean;
  ready: boolean;
  ap2Session: Ap2SessionState | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setAp2Session: (session: Ap2SessionState | null) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function sessionStorageKey(accountId: string, threadId: string): string {
  return `pocu_ap2_session:${accountId}:${threadId}`;
}

export function loadStoredAp2Session(
  accountId: string,
  threadId: string
): Ap2SessionState | null {
  try {
    const raw = sessionStorage.getItem(sessionStorageKey(accountId, threadId));
    if (!raw) return null;
    return normalizeAp2Session(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function storeAp2Session(
  accountId: string,
  threadId: string,
  session: Ap2SessionState | null
): void {
  const key = sessionStorageKey(accountId, threadId);
  if (!session) {
    sessionStorage.removeItem(key);
    return;
  }
  sessionStorage.setItem(key, JSON.stringify(session));
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [ready, setReady] = useState(false);
  const [ap2Session, setAp2SessionState] = useState<Ap2SessionState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const restored = await restoreWalletSession();
        if (!cancelled && restored) setAccountId(restored);
      } catch (e) {
        console.error("[wallet] session restore error", e);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const id = await connectWallet();
      setAccountId(id);
    } catch (e) {
      console.error("[wallet] session error", e);
      throw e;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectWallet();
    setAccountId(null);
    setAp2SessionState(null);
  }, []);

  const setAp2Session = useCallback((session: Ap2SessionState | null) => {
    setAp2SessionState(session);
  }, []);

  const value = useMemo(
    () => ({
      accountId,
      connecting,
      ready,
      ap2Session,
      connect,
      disconnect,
      setAp2Session,
    }),
    [accountId, connecting, ready, ap2Session, connect, disconnect, setAp2Session]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
