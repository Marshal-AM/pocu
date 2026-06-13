"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatPanel } from "@/components/agent/ChatPanel";
import type {
  Architecture,
  ChatBlock,
  ChatThread,
} from "@/components/agent/types";
import { Ap2SetupGate } from "@/components/Ap2SetupGate";
import {
  useWallet,
  loadStoredAp2Session,
  storeAp2Session,
} from "../components/WalletProvider";
import {
  authorizeSessionAllowance,
  completeAp2SessionAfterAllowance,
  ensureAp2ReadyForTraining,
  fetchAp2Session,
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
  const [agentError, setAgentError] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<{
    status?: string;
    progress_pct?: number;
    message?: string;
  } | null>(null);
  const [showAp2Setup, setShowAp2Setup] = useState(false);
  const [ap2SetupLoading, setAp2SetupLoading] = useState(false);
  const [ap2SetupStatus, setAp2SetupStatus] = useState<string | null>(null);
  const [ap2SetupError, setAp2SetupError] = useState<string | null>(null);
  const [ap2SettlementNote, setAp2SettlementNote] = useState<string | null>(null);
  const { accountId, ap2Session, setAp2Session, ready: walletReady } = useWallet();
  const autoNewChatForAccount = useRef<string | null>(null);
  const chatRequestId = useRef(0);
  const ap2SetupRequestId = useRef(0);

  const selectedArch = architectures.find((a) => a.id === architectureId);
  const threadStorageKey = accountId ? `pocu_thread_id:${accountId}` : null;
  const ap2SessionActive = ap2Session?.status === "active";

  const loadThreads = useCallback(async () => {
    if (!accountId) {
      setThreads([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/threads?account_id=${encodeURIComponent(accountId)}`
      );
      if (res.ok) setThreads(await res.json());
    } catch {
      /* ignore */
    }
  }, [accountId]);

  const loadThread = useCallback(
    async (id: string) => {
      if (!accountId) return;
      chatRequestId.current += 1;
      ap2SetupRequestId.current += 1;
      setLoading(false);
      setPipelineStatus(null);
      setJobProgress(null);
      try {
        const res = await fetch(
          `/api/threads/${id}?account_id=${encodeURIComponent(accountId)}`
        );
        if (!res.ok) {
          if (res.status === 404 && threadStorageKey) {
            localStorage.removeItem(threadStorageKey);
            setThreadId(null);
          }
          return;
        }
        const data = (await res.json()) as ChatThread & { messages?: ChatBlock[] };
        setThreadId(data.id);
        if (threadStorageKey) localStorage.setItem(threadStorageKey, data.id);
        setChat(data.messages ?? []);
        if (data.title) setUseCase(data.title);

        const stored = loadStoredAp2Session(accountId, data.id);
        if (stored?.session_id) {
          const live = await fetchAp2Session(stored.session_id, accountId);
          if (live?.status === "active") {
            setAp2Session(live);
            setShowAp2Setup(false);
          } else {
            setAp2Session(null);
            setShowAp2Setup(true);
          }
        } else {
          setAp2Session(null);
          setShowAp2Setup(true);
        }
      } catch {
        /* ignore */
      }
    },
    [accountId, threadStorageKey, setAp2Session]
  );

  const startNewChat = useCallback(() => {
    chatRequestId.current += 1;
    ap2SetupRequestId.current += 1;
    setLoading(false);
    setPipelineStatus(null);
    setJobProgress(null);
    setThreadId(null);
    if (threadStorageKey) localStorage.removeItem(threadStorageKey);
    setChat([]);
    setMessage("");
    setUseCase("");
    setArchitectureId("");
    setAgentPickedUseCase(false);
    setAgentPickedArch(false);
    setAp2Session(null);
    setAp2SetupError(null);
    setAp2SetupStatus(null);
    setShowAp2Setup(true);
  }, [threadStorageKey, setAp2Session]);

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
        autoNewChatForAccount.current = null;
        setThreads([]);
        setThreadId(null);
        setChat([]);
        setAp2Session(null);
      }
      return;
    }
    void loadThreads();
    if (autoNewChatForAccount.current !== accountId) {
      autoNewChatForAccount.current = accountId;
      startNewChat();
    }
  }, [accountId, walletReady, loadThreads, startNewChat, setAp2Session]);

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

  async function ensureThreadId(): Promise<string | null> {
    if (threadId) return threadId;
    if (!accountId) return null;
    const res = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: useCase || "New chat",
        use_case: useCase,
        architecture_id: architectureId,
        user_account_id: accountId,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const thread = (await res.json()) as ChatThread;
    setThreadId(thread.id);
    if (threadStorageKey) localStorage.setItem(threadStorageKey, thread.id);
    return thread.id;
  }

  async function runAp2Setup(): Promise<Ap2SessionState | null> {
    if (!accountId) {
      setAp2SetupError("Connect HashPack before authorizing.");
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

      setStatus("Allowance confirmed. Creating chat thread…");
      const tid = await ensureThreadId();
      if (isStale()) return null;
      if (!tid) throw new Error("Could not create chat thread");

      const session = await completeAp2SessionAfterAllowance({
        threadId: tid,
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
      storeAp2Session(accountId, tid, ready);
      setShowAp2Setup(false);
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
    if (!ap2SessionActive) {
      setShowAp2Setup(true);
      return;
    }
    const prompt = `Use dataset "${ref}" (${title}). Inspect it, download, prepare, and start the training job.`;
    if (!loading) void sendChat(prompt);
    else setMessage(prompt);
  }

  async function handleStartTraining(ref: string, title: string) {
    if (!ap2SessionActive) {
      setShowAp2Setup(true);
      return;
    }
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
    if (ap2Session?.status !== "active") {
      setShowAp2Setup(true);
      return;
    }

    let activeSession: Ap2SessionState;
    try {
      activeSession = await ensureAp2ReadyForTraining({
        userAccountId: accountId,
        session: ap2Session,
      });
      setAp2Session(activeSession);
      if (threadId) storeAp2Session(accountId, threadId, activeSession);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAgentError(msg);
      setShowAp2Setup(true);
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
    setAp2SettlementNote(null);
    setPipelineStatus(null);
    setJobProgress(null);

    try {
      const history = threadId
        ? undefined
        : chat.flatMap((b) => {
            const parts: { role: string; content: string }[] = [];
            if (b.role === "user" && b.text) parts.push({ role: "user", content: b.text });
            if (b.role === "assistant" && b.text) {
              parts.push({ role: "assistant", content: b.text });
            }
            return parts;
          });

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          use_case: useCase,
          architecture_id: architectureId,
          thread_id: threadId,
          history,
          user_account_id: accountId,
          ap2_session_id: activeSession.session_id,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `Chat failed (${res.status})`);
      }
      if (!res.body) throw new Error("No response body from agent");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

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
            };

            if (event.type === "status" && event.message) {
              setPipelineStatus(event.message);
            } else if (event.type === "ap2_settlement") {
              const amt =
                event.amount_hbar != null ? `${event.amount_hbar} HBAR` : "HBAR";
              const tx = event.hedera_tx_id ? ` (tx ${event.hedera_tx_id})` : "";
              setAp2SettlementNote(`AP2 payment: ${amt} debited from allowance${tx}`);
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
              if (accountId && activeSession) {
                storeAp2Session(accountId, event.thread_id, activeSession);
              }
            } else if (event.type === "selection") {
              if (event.use_case) {
                setUseCase(event.use_case);
                setAgentPickedUseCase(Boolean(event.auto));
              }
              if (event.architecture_id) {
                setArchitectureId(event.architecture_id);
                setAgentPickedArch(Boolean(event.auto));
              }
            } else if (event.type === "text" && event.content) {
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
      }

      setChat((c) => {
        if (requestId !== chatRequestId.current) return c;
        const last = c[c.length - 1];
        if (last?.role === "assistant") return c;
        if (last?.role !== "user") return c;
        return [...c, { role: "assistant", text: "No response from agent." }];
      });
    } catch (e) {
      setChat((c) => {
        if (requestId !== chatRequestId.current) return c;
        return [
          ...c,
          {
            role: "assistant",
            text: `Error: ${e instanceof Error ? e.message : e}`,
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

  function handleThreadChange(id: string | null) {
    if (id) void loadThread(id);
    else startNewChat();
  }

  return (
    <div className="flex min-h-0 flex-1">
      <Ap2SetupGate
        sessionActive={ap2SessionActive}
        showSetup={showAp2Setup}
        setupLoading={ap2SetupLoading}
        setupStatus={ap2SetupStatus}
        setupError={ap2SetupError}
        onAuthorize={() => void runAp2Setup()}
        onOpenSetup={() => {
          setAp2SetupError(null);
          setShowAp2Setup(true);
        }}
        onDismissSetup={
          ap2SetupLoading
            ? undefined
            : () => {
                setShowAp2Setup(false);
                setAp2SetupError(null);
              }
        }
      >
        <ChatPanel
          agentError={agentError}
          ap2SettlementNote={ap2SettlementNote}
          threadId={threadId}
          threads={threads}
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
          chatDisabled={!ap2SessionActive}
          onThreadChange={handleThreadChange}
          onNewChat={startNewChat}
          onOpenAp2Setup={() => setShowAp2Setup(true)}
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
      </Ap2SetupGate>
    </div>
  );
}
