"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatPanel } from "@/components/agent/ChatPanel";
import type {
  Ap2Payment,
  Architecture,
  ChatBlock,
  ChatThread,
} from "@/components/agent/types";
import { useWallet } from "../components/WalletProvider";
import {
  authorizeSessionAllowance,
  completeAp2SessionAfterAllowance,
  ensureAp2ReadyForTraining,
  fetchAp2PaymentsForThread,
  fetchAp2SessionForThread,
  requiresAp2Reauthorization,
  validateWalletConfigAgainstAgent,
  type Ap2SessionState,
  type Ap2SetupStep,
} from "@/lib/wallet/ap2-session";
import { ALLOWANCE_HBAR } from "@/lib/wallet/config";
import { ensureWalletReadyForSigning } from "@/lib/wallet/hashpack-connect";

export default function HomePage() {
  const [architectures, setArchitectures] = useState<Architecture[]>([]);
  const [tierFilter, setTierFilter] = useState<string>("");
  const [architectureId, setArchitectureId] = useState("");
  const [useCase, setUseCase] = useState("");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [agentPickedUseCase, setAgentPickedUseCase] = useState(false);
  const [agentPickedArch, setAgentPickedArch] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<{
    status?: string;
    progress_pct?: number;
    message?: string;
  } | null>(null);
  const [ap2SetupLoading, setAp2SetupLoading] = useState(false);
  const [ap2SetupStatus, setAp2SetupStatus] = useState<string | null>(null);
  const [ap2SetupError, setAp2SetupError] = useState<string | null>(null);
  const [ap2PaymentsByThread, setAp2PaymentsByThread] = useState<
    Record<string, Ap2Payment[]>
  >({});
  const { accountId, ap2Session, setAp2Session, ready: walletReady } = useWallet();
  const loadedAccountRef = useRef<string | null>(null);
  const chatRequestId = useRef(0);
  const ap2SetupRequestId = useRef(0);

  const selectedArch = architectures.find((a) => a.id === architectureId);
  const threadStorageKey = accountId ? `pocu_thread_id:${accountId}` : null;
  const ap2SessionActive = ap2Session?.status === "active";

  const invalidateAp2Session = useCallback(() => {
    setAp2Session(null);
    setAp2SetupError(null);
    setAp2SetupStatus(null);
  }, [setAp2Session]);

  const handleAp2SessionFailure = useCallback(
    (message: string): boolean => {
      if (!requiresAp2Reauthorization(message)) return false;
      invalidateAp2Session();
      setAgentError(null);
      return true;
    },
    [invalidateAp2Session]
  );

  const loadThreads = useCallback(async (): Promise<ChatThread[]> => {
    if (!accountId) {
      setThreads([]);
      return [];
    }
    try {
      const res = await fetch(
        `/api/threads?account_id=${encodeURIComponent(accountId)}`
      );
      if (!res.ok) return [];
      const data = (await res.json()) as ChatThread[];
      setThreads(data);
      return data;
    } catch {
      return [];
    }
  }, [accountId]);

  const loadAp2PaymentsForThread = useCallback(
    async (id: string) => {
      if (!accountId) return;
      try {
        const payments = await fetchAp2PaymentsForThread(id, accountId);
        setAp2PaymentsByThread((prev) => ({ ...prev, [id]: payments }));
      } catch {
        /* ignore — payments are optional */
      }
    },
    [accountId]
  );

  const loadAp2SessionForThread = useCallback(
    async (id: string) => {
      if (!accountId) {
        setAp2Session(null);
        return;
      }
      try {
        const live = await fetchAp2SessionForThread(id, accountId);
        if (live?.status === "active") {
          setAp2Session(live);
        } else {
          setAp2Session(null);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!handleAp2SessionFailure(msg)) {
          setAp2Session(null);
        }
      }
    },
    [accountId, setAp2Session, handleAp2SessionFailure]
  );

  const loadThread = useCallback(
    async (id: string) => {
      if (!accountId) return;
      chatRequestId.current += 1;
      ap2SetupRequestId.current += 1;
      setAp2SetupLoading(false);
      setLoading(false);
      setPipelineStatus(null);
      setJobProgress(null);
      setAp2SetupError(null);
      setAp2SetupStatus(null);
      try {
        const res = await fetch(
          `/api/threads/${id}?account_id=${encodeURIComponent(accountId)}`
        );
        if (!res.ok) {
          if (res.status === 404 && threadStorageKey) {
            localStorage.removeItem(threadStorageKey);
          }
          return;
        }
        const data = (await res.json()) as ChatThread & { messages?: ChatBlock[] };
        setThreadId(data.id);
        if (threadStorageKey) localStorage.setItem(threadStorageKey, data.id);
        setChat(data.messages ?? []);
        if (data.title) setUseCase(data.title);
        await loadAp2SessionForThread(data.id);
        void loadAp2PaymentsForThread(data.id);
      } catch {
        /* ignore */
      }
    },
    [accountId, threadStorageKey, loadAp2SessionForThread, loadAp2PaymentsForThread]
  );

  const createChat = useCallback(async () => {
    if (!accountId) return;
    const res = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New chat",
        user_account_id: accountId,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const thread = (await res.json()) as ChatThread;
    await loadThreads();
    await loadThread(thread.id);
  }, [accountId, loadThreads, loadThread]);

  const renameThread = useCallback(
    async (id: string, title: string) => {
      if (!accountId) return;
      const res = await fetch(`/api/threads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          user_account_id: accountId,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as ChatThread;
      setThreads((prev) =>
        prev.map((t) => (t.id === id ? { ...t, title: updated.title } : t))
      );
      if (threadId === id) setUseCase(updated.title || title);
    },
    [accountId, threadId]
  );

  const loadArchs = useCallback(async () => {
    const q = tierFilter ? `?tier=${tierFilter}` : "";
    const res = await fetch(`/api/architectures${q}`);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || `Architectures failed (${res.status})`);
    }
    const data = (await res.json()) as Architecture[];
    if (!Array.isArray(data)) {
      throw new Error("Invalid architectures response from agent");
    }
    setArchitectures(data);
    setAgentError(null);
  }, [tierFilter]);

  useEffect(() => {
    loadArchs().catch((e) => {
      setAgentError(
        e instanceof Error
          ? e.message
          : "Cannot load architectures — is the agent running on port 8000?"
      );
      setArchitectures([]);
    });
  }, [loadArchs]);

  useEffect(() => {
    if (!accountId || !walletReady) {
      if (!accountId) {
        loadedAccountRef.current = null;
        setThreads([]);
        setThreadId(null);
        setChat([]);
        setAp2Session(null);
      }
      return;
    }

    if (loadedAccountRef.current === accountId) return;

    void (async () => {
      setThreadsLoading(true);
      try {
        const list = await loadThreads();
        loadedAccountRef.current = accountId;

        if (list.length === 0) {
          setThreadId(null);
          setChat([]);
          setAp2Session(null);
          return;
        }

        const saved = threadStorageKey
          ? localStorage.getItem(threadStorageKey)
          : null;
        const target =
          saved && list.some((t) => t.id === saved) ? saved : list[0].id;
        await loadThread(target);
      } finally {
        setThreadsLoading(false);
      }
    })();
  }, [
    accountId,
    walletReady,
    loadThreads,
    loadThread,
    threadStorageKey,
    setAp2Session,
  ]);

  function upsertAssistantBlock(
    updater: (block: ChatBlock) => ChatBlock,
    requestId: number
  ) {
    setChat((c) => {
      if (requestId !== chatRequestId.current) return c;
      const next = [...c];
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        next[next.length - 1] = updater({ ...last });
      } else {
        next.push(updater({ role: "assistant" }));
      }
      return next;
    });
  }

  async function runAp2Setup(): Promise<Ap2SessionState | null> {
    if (!accountId) {
      setAp2SetupError("Connect HashPack before authorizing.");
      return null;
    }
    if (!threadId) {
      setAp2SetupError("Create a chat before authorizing.");
      return null;
    }
    const requestId = ++ap2SetupRequestId.current;
    const isStale = () => requestId !== ap2SetupRequestId.current;
    const setStatus = (msg: string) => {
      if (!isStale()) setAp2SetupStatus(msg);
    };

    setAp2SetupLoading(true);
    setAp2SetupStatus("Checking wallet configuration…");
    setAp2SetupError(null);
    setAgentError(null);
    try {
      const { getConnectedAccountId, getDAppConnector } = await import(
        "@/lib/wallet/hedera-wallet"
      );
      const dApp = await getDAppConnector();
      await ensureWalletReadyForSigning(dApp);
      if (!getConnectedAccountId()) {
        throw new Error("Connect HashPack first, then authorize the AP2 session.");
      }

      await validateWalletConfigAgainstAgent();
      if (isStale()) return null;

      const onStep = (_step: Ap2SetupStep, msg: string) => setStatus(msg);
      setStatus(`Open HashPack to approve ${ALLOWANCE_HBAR} HBAR allowance…`);
      const allowanceTxId = await authorizeSessionAllowance(accountId, onStep);
      if (isStale()) return null;

      setStatus("Allowance confirmed. Activating AP2 session…");
      const session = await completeAp2SessionAfterAllowance({
        threadId,
        userAccountId: accountId,
        intent: useCase || "POCU chat and on-chain ML training",
        allowanceTxId,
        onStep,
      });
      if (isStale()) return null;
      if (session.status !== "active") {
        throw new Error(`AP2 session not active (status=${session.status})`);
      }

      setStatus("Associating model NFT token (required for training)…");
      const ready = await ensureAp2ReadyForTraining({
        userAccountId: accountId,
        session,
        onStep,
      });
      if (isStale()) return null;

      setAp2Session(ready);
      setAp2SetupStatus(null);
      setAp2SetupError(null);
      return session;
    } catch (e) {
      if (isStale()) return null;
      const msg = e instanceof Error ? e.message : String(e);
      setAp2SetupError(msg);
      setAgentError(msg);
      return null;
    } finally {
      if (requestId === ap2SetupRequestId.current) {
        setAp2SetupLoading(false);
      }
    }
  }

  async function handleDatasetSelect(ref: string, title: string) {
    if (!ap2SessionActive) return;
    const prompt = `Use dataset "${ref}" (${title}). Inspect it, download, prepare, and start the training job.`;
    if (!loading) void sendChat(prompt);
    else setMessage(prompt);
  }

  async function handleStartTraining(ref: string, title: string) {
    if (!ap2SessionActive) return;
    if (!accountId) {
      setAgentError("Connect HashPack before training.");
      return;
    }
    try {
      const { getConnectedAccountId } = await import("@/lib/wallet/hedera-wallet");
      if (!getConnectedAccountId()) {
        setAgentError("Wallet session expired — reconnect HashPack, then try again.");
        return;
      }
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : String(e));
      return;
    }
    const prompt = `Yes, start training with dataset "${ref}" (${title}). Inspect it, download, prepare, and queue the job.`;
    if (!loading) void sendChat(prompt);
    else setMessage(prompt);
  }

  function handleShowAlternatives() {
    const prompt = "Show me other dataset options for this use case.";
    if (!loading) void sendChat(prompt);
    else setMessage(prompt);
  }

  async function sendChat(overrideMessage?: string) {
    const userMsg = (overrideMessage ?? message).trim();
    if (!userMsg) return;
    if (!accountId) {
      setAgentError("Connect your wallet before chatting.");
      return;
    }
    if (!threadId) {
      setAgentError("Create or select a chat first.");
      return;
    }
    if (ap2Session?.status !== "active") return;

    let activeSession: Ap2SessionState;
    try {
      activeSession = await ensureAp2ReadyForTraining({
        userAccountId: accountId,
        session: ap2Session,
      });
      setAp2Session(activeSession);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (handleAp2SessionFailure(msg)) return;
      setAgentError(msg);
      return;
    }

    if (!overrideMessage) setMessage("");
    const requestId = ++chatRequestId.current;
    setChat((c) => {
      if (requestId !== chatRequestId.current) return c;
      return [...c, { role: "user", text: userMsg }];
    });
    setLoading(true);
    setAgentError(null);
    setPipelineStatus(null);
    setJobProgress(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          use_case: useCase,
          architecture_id: architectureId,
          thread_id: threadId,
          user_account_id: accountId,
          ap2_session_id: activeSession.session_id,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        if (handleAp2SessionFailure(err)) return;
        throw new Error(err || `Chat failed (${res.status})`);
      }
      if (!res.body) throw new Error("No response body from agent");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let ap2Invalidated = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const event = JSON.parse(payload) as {
              type: string;
              content?: string;
              message?: string;
              status?: string;
              progress_pct?: number;
              amount_hbar?: number;
              hedera_tx_id?: string;
              dataset?: ChatBlock["dataset"];
              datasets?: ChatBlock["datasets"];
              job?: ChatBlock["job"];
              use_case?: string;
              architecture_id?: string;
              auto?: boolean;
              thread_id?: string;
              title?: string;
            };

            if (event.type === "status" && event.message) {
              setPipelineStatus(event.message);
            } else if (event.type === "ap2_settlement" && threadId) {
              const payment: Ap2Payment = {
                amount_hbar: event.amount_hbar ?? 0.1,
                hedera_tx_id: event.hedera_tx_id ?? "",
                reason: "chat_turn",
                created_at: new Date().toISOString(),
              };
              setAp2PaymentsByThread((prev) => {
                const current = prev[threadId] ?? [];
                if (
                  payment.hedera_tx_id &&
                  current.some((p) => p.hedera_tx_id === payment.hedera_tx_id)
                ) {
                  return prev;
                }
                return { ...prev, [threadId]: [payment, ...current] };
              });
            } else if (event.type === "job_progress") {
              setJobProgress({
                status: event.status,
                progress_pct: event.progress_pct,
                message: event.message,
              });
              if (event.message) setPipelineStatus(event.message);
            } else if (event.type === "thread" && event.thread_id) {
              setThreadId(event.thread_id);
              if (threadStorageKey) {
                localStorage.setItem(threadStorageKey, event.thread_id);
              }
              if (event.title) {
                setThreads((prev) =>
                  prev.map((t) =>
                    t.id === event.thread_id
                      ? { ...t, title: event.title ?? t.title }
                      : t
                  )
                );
              }
            } else if (event.type === "selection") {
              if (event.use_case) {
                setUseCase(event.use_case);
                setAgentPickedUseCase(Boolean(event.auto));
                if (threadId) {
                  const autoTitle = event.use_case.slice(0, 200);
                  setThreads((prev) =>
                    prev.map((t) =>
                      t.id === threadId ? { ...t, title: autoTitle } : t
                    )
                  );
                }
              }
              if (event.architecture_id) {
                setArchitectureId(event.architecture_id);
                setAgentPickedArch(Boolean(event.auto));
              }
            } else if (event.type === "text" && event.content) {
              if (handleAp2SessionFailure(event.content)) {
                ap2Invalidated = true;
                break;
              }
              upsertAssistantBlock(
                (block) => ({
                  ...block,
                  text: (block.text ?? "") + event.content,
                }),
                requestId
              );
            } else if (event.type === "dataset" && event.dataset) {
              upsertAssistantBlock(
                (block) => ({
                  ...block,
                  dataset: event.dataset,
                  datasets: undefined,
                }),
                requestId
              );
            } else if (event.type === "datasets" && event.datasets?.length) {
              upsertAssistantBlock(
                (block) => ({
                  ...block,
                  datasets: event.datasets,
                  dataset: undefined,
                }),
                requestId
              );
            } else if (
              (event.type === "job" || event.type === "job_status") &&
              event.job
            ) {
              upsertAssistantBlock(
                (block) => ({
                  ...block,
                  job: event.job,
                }),
                requestId
              );
            } else if (event.content) {
              if (handleAp2SessionFailure(event.content)) {
                ap2Invalidated = true;
                break;
              }
              upsertAssistantBlock(
                (block) => ({
                  ...block,
                  text: (block.text ?? "") + event.content,
                }),
                requestId
              );
            }
          } catch {
            /* skip */
          }
        }
        if (ap2Invalidated) break;
      }

      if (ap2Invalidated) return;

      setChat((c) => {
        if (requestId !== chatRequestId.current) return c;
        const last = c[c.length - 1];
        if (last?.role === "assistant") return c;
        if (last?.role !== "user") return c;
        return [...c, { role: "assistant", text: "No response from agent." }];
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (handleAp2SessionFailure(msg)) return;
      setChat((c) => {
        if (requestId !== chatRequestId.current) return c;
        return [
          ...c,
          {
            role: "assistant",
            text: `Error: ${msg}`,
          },
        ];
      });
    } finally {
      if (requestId === chatRequestId.current) {
        setLoading(false);
        setPipelineStatus(null);
        void loadThreads();
      }
    }
  }

  function handleThreadChange(id: string) {
    void loadThread(id);
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1">
      <ChatPanel
        agentError={agentError}
        ap2Payments={threadId ? ap2PaymentsByThread[threadId] ?? [] : []}
        onLoadAp2Payments={
          threadId ? () => loadAp2PaymentsForThread(threadId) : undefined
        }
        ap2SessionActive={ap2SessionActive}
        ap2SetupLoading={ap2SetupLoading}
        ap2SetupStatus={ap2SetupStatus}
        ap2SetupError={ap2SetupError}
        onAuthorize={() => void runAp2Setup()}
        threadId={threadId}
        threads={threads}
        threadsLoading={threadsLoading}
        onCreateFirstChat={() => void createChat().catch((e) => {
          setAgentError(e instanceof Error ? e.message : String(e));
        })}
        useCase={useCase}
        agentPickedUseCase={agentPickedUseCase}
        agentPickedArch={agentPickedArch}
        tierFilter={tierFilter}
        architectureId={architectureId}
        architectures={architectures}
        selectedArch={selectedArch}
        chat={chat}
        message={message}
        loading={loading}
        pipelineStatus={pipelineStatus}
        jobProgressPct={jobProgress?.progress_pct}
        onThreadChange={handleThreadChange}
        onNewChat={() => void createChat().catch((e) => {
          setAgentError(e instanceof Error ? e.message : String(e));
        })}
        onRenameThread={renameThread}
        onMessageChange={setMessage}
        onSend={() => void sendChat()}
        onUseCaseChange={(value) => {
          setUseCase(value);
          setAgentPickedUseCase(false);
        }}
        onClearUseCase={() => {
          setUseCase("");
          setAgentPickedUseCase(false);
        }}
        onPresetSelect={(chip) => {
          setUseCase(chip);
          setAgentPickedUseCase(false);
        }}
        onTierFilterChange={setTierFilter}
        onArchitectureSelect={(id) => {
          setArchitectureId(id);
          setAgentPickedArch(false);
        }}
        onClearArchitecture={() => {
          setArchitectureId("");
          setAgentPickedArch(false);
        }}
        onStartTraining={handleStartTraining}
        onShowAlternatives={handleShowAlternatives}
        onDatasetSelect={handleDatasetSelect}
      />
    </div>
  );
}
