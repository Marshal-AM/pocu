"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChatMarkdown } from "./components/ChatMarkdown";
import { useWallet } from "../components/WalletProvider";
import { authorizeTraining } from "@/lib/wallet/authorize-training";
import type { WalletAuthResult } from "@/lib/wallet/authorize-training";

interface Architecture {
  id: string;
  name: string;
  tier: string;
  description: string;
  taskType: string;
  maxInputDim: number;
}

interface KaggleDataset {
  ref: string;
  title: string;
  vote_count?: number;
  download_count?: number;
  usability_rating?: number;
  total_bytes?: number;
}

interface JobInfo {
  job_id: string;
  status?: string;
  message?: string;
  manifest_path?: string;
}

interface ChatBlock {
  role: "user" | "assistant";
  text?: string;
  dataset?: KaggleDataset;
  datasets?: KaggleDataset[];
  job?: JobInfo;
}

interface ChatThread {
  id: string;
  title: string | null;
  use_case?: string | null;
  architecture_id?: string | null;
  created_at: string;
}

const USE_CASE_CHIPS = [
  "Fraud detection",
  "Heart disease screening",
  "Customer churn",
  "Credit default risk",
  "Diabetes prediction",
  "Spam detection",
  "Demand forecasting",
  "Predictive maintenance",
];

function formatBytes(bytes?: number): string {
  if (!bytes) return "—";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

function DatasetCardBody({
  ds,
  actions,
}: {
  ds: KaggleDataset;
  actions: ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "0.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: "0.9rem", lineHeight: 1.3 }}>
        {ds.title || ds.ref}
      </div>
      <div style={{ fontSize: "0.75rem", color: "var(--muted)", wordBreak: "break-all" }}>
        {ds.ref}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          fontSize: "0.72rem",
          color: "var(--muted)",
        }}
      >
        <span>↑ {ds.vote_count ?? 0} votes</span>
        <span>↓ {ds.download_count ?? 0} downloads</span>
        {ds.usability_rating != null && (
          <span>★ {Number(ds.usability_rating).toFixed(1)}</span>
        )}
        <span>{formatBytes(ds.total_bytes)}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.25rem" }}>
        <a
          href={`https://www.kaggle.com/datasets/${ds.ref}`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: "0.75rem", alignSelf: "center" }}
        >
          View on Kaggle
        </a>
        {actions}
      </div>
    </div>
  );
}

function RecommendedDatasetCard({
  dataset,
  onStartTraining,
  onShowAlternatives,
}: {
  dataset: KaggleDataset;
  onStartTraining: (ref: string, title: string) => void;
  onShowAlternatives: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.5rem" }}>
      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--accent)" }}>
        Recommended dataset
      </div>
      <DatasetCardBody
        ds={dataset}
        actions={
          <>
            <button
              type="button"
              onClick={() => onStartTraining(dataset.ref, dataset.title || dataset.ref)}
              style={{
                marginLeft: "auto",
                background: "var(--accent)",
                border: "none",
                color: "#fff",
                borderRadius: 6,
                padding: "0.3rem 0.6rem",
                fontSize: "0.75rem",
              }}
            >
              Start training
            </button>
            <button
              type="button"
              onClick={onShowAlternatives}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--muted)",
                borderRadius: 6,
                padding: "0.3rem 0.6rem",
                fontSize: "0.75rem",
              }}
            >
              Show other options
            </button>
          </>
        }
      />
    </div>
  );
}

function DatasetCards({
  datasets,
  onSelect,
}: {
  datasets: KaggleDataset[];
  onSelect: (ref: string, title: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.5rem" }}>
      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--accent)" }}>
        Kaggle datasets found ({datasets.length})
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "0.6rem",
        }}
      >
        {datasets.map((ds) => (
          <DatasetCardBody
            key={ds.ref}
            ds={ds}
            actions={
              <button
                type="button"
                onClick={() => onSelect(ds.ref, ds.title || ds.ref)}
                style={{
                  marginLeft: "auto",
                  background: "var(--accent)",
                  border: "none",
                  color: "#fff",
                  borderRadius: 6,
                  padding: "0.3rem 0.6rem",
                  fontSize: "0.75rem",
                }}
              >
                Use this dataset
              </button>
            }
          />
        ))}
      </div>
    </div>
  );
}

function JobCard({ job }: { job: JobInfo }) {
  return (
    <div
      style={{
        marginTop: "0.5rem",
        padding: "0.75rem",
        background: "rgba(52, 211, 153, 0.1)",
        border: "1px solid var(--success)",
        borderRadius: 10,
        fontSize: "0.85rem",
      }}
    >
      <div style={{ fontWeight: 600, color: "var(--success)" }}>Training job queued</div>
      <div style={{ marginTop: "0.35rem" }}>
        Status: {job.status ?? "pending"} · 2 samples, 1 epoch
      </div>
      <Link href={`/jobs/${job.job_id}`} style={{ display: "inline-block", marginTop: "0.5rem" }}>
        View job {job.job_id.slice(0, 8)}… →
      </Link>
    </div>
  );
}

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
  const [acpStatus, setAcpStatus] = useState<{
    status?: string;
    progress_pct?: number;
    message?: string;
  } | null>(null);
  const { accountId, walletAuth, setWalletAuth } = useWallet();

  const selectedArch = architectures.find((a) => a.id === architectureId);

  const threadStorageKey = accountId ? `pocu_thread_id:${accountId}` : null;

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
      } catch {
        /* ignore */
      }
    },
    [accountId, threadStorageKey]
  );

  const startNewChat = useCallback(() => {
    setThreadId(null);
    if (threadStorageKey) localStorage.removeItem(threadStorageKey);
    setChat([]);
    setMessage("");
    setAgentPickedUseCase(false);
    setAgentPickedArch(false);
  }, [threadStorageKey]);

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
        e instanceof Error ? e.message : "Cannot load architectures — is the agent running on port 8000?"
      );
      setArchitectures([]);
    });
  }, [loadArchs]);

  useEffect(() => {
    if (!accountId) {
      setThreads([]);
      setThreadId(null);
      setChat([]);
      return;
    }
    void loadThreads();
    const saved = threadStorageKey
      ? localStorage.getItem(threadStorageKey)
      : null;
    if (saved) void loadThread(saved);
    else {
      setThreadId(null);
      setChat([]);
    }
  }, [accountId, loadThreads, loadThread, threadStorageKey]);

  function upsertAssistantBlock(updater: (block: ChatBlock) => ChatBlock) {
    setChat((c) => {
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

  async function ensureWalletAuth(intent: string): Promise<WalletAuthResult | null> {
    if (!accountId) {
      setAgentError("Connect HashPack before starting training.");
      return null;
    }
    if (walletAuth) return walletAuth;
    try {
      setAgentError(null);
      const auth = await authorizeTraining(intent, (_step, message) => {
        setPipelineStatus(message);
      });
      setWalletAuth(auth);
      setPipelineStatus(null);
      return auth;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAgentError(msg);
      setPipelineStatus(null);
      return null;
    }
  }

  async function handleDatasetSelect(ref: string, title: string) {
    const intent = useCase || title;
    const auth = await ensureWalletAuth(intent);
    if (!auth) return;
    const prompt = `Use dataset "${ref}" (${title}). Inspect it, download, prepare, and start the training job.`;
    if (!loading) {
      void sendChat(prompt, auth);
    } else {
      setMessage(prompt);
    }
  }

  async function handleStartTraining(ref: string, title: string) {
    const intent = useCase || title;
    const auth = await ensureWalletAuth(intent);
    if (!auth) return;
    const prompt = `Yes, start training with dataset "${ref}" (${title}). Inspect it, download, prepare, and queue the job.`;
    if (!loading) {
      void sendChat(prompt, auth);
    } else {
      setMessage(prompt);
    }
  }

  function handleShowAlternatives() {
    const prompt = "Show me other dataset options for this use case.";
    if (!loading) {
      void sendChat(prompt);
    } else {
      setMessage(prompt);
    }
  }

  async function sendChat(overrideMessage?: string, authOverride?: WalletAuthResult) {
    const userMsg = (overrideMessage ?? message).trim();
    if (!userMsg) return;
    if (!overrideMessage) setMessage("");
    setChat((c) => [...c, { role: "user", text: userMsg }]);
    setLoading(true);
    setAgentError(null);
    setPipelineStatus(null);
    setAcpStatus(null);

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

      const auth = authOverride ?? walletAuth;
      if (!accountId) {
        throw new Error("Connect your wallet before chatting.");
      }
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
          wallet_auth: auth
            ? {
                user_account_id: auth.user_account_id,
                mandate: auth.mandate,
                mandate_signature: auth.mandate_signature,
                allowance_tx_id: auth.allowance_tx_id,
                associate_tx_id: auth.associate_tx_id,
                initiation_tx_id: auth.initiation_tx_id,
                acp_order_id: auth.acp_order_id,
              }
            : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `Chat failed (${res.status})`);
      }
      if (!res.body) {
        throw new Error("No response body from agent");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      if (reader) {
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
                dataset?: KaggleDataset;
                datasets?: KaggleDataset[];
                job?: JobInfo;
                use_case?: string;
                architecture_id?: string;
                auto?: boolean;
                thread_id?: string;
              };

              if (event.type === "status" && event.message) {
                setPipelineStatus(event.message);
                upsertAssistantBlock((block) => ({
                  ...block,
                  text: block.text ?? "",
                }));
              } else if (event.type === "acp_status") {
                setAcpStatus({
                  status: event.status as string | undefined,
                  progress_pct: event.progress_pct as number | undefined,
                  message: event.message as string | undefined,
                });
                if (event.message) setPipelineStatus(event.message);
              } else if (event.type === "thread" && event.thread_id) {
                setThreadId(event.thread_id);
                if (threadStorageKey) {
                  localStorage.setItem(threadStorageKey, event.thread_id);
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
                upsertAssistantBlock((block) => ({
                  ...block,
                  text: (block.text ?? "") + event.content,
                }));
              } else if (event.type === "dataset" && event.dataset) {
                upsertAssistantBlock((block) => ({
                  ...block,
                  dataset: event.dataset,
                  datasets: undefined,
                }));
              } else if (event.type === "datasets" && event.datasets?.length) {
                upsertAssistantBlock((block) => ({
                  ...block,
                  datasets: event.datasets,
                  dataset: undefined,
                }));
              } else if (
                (event.type === "job" || event.type === "job_status") &&
                event.job
              ) {
                upsertAssistantBlock((block) => ({
                  ...block,
                  job: event.job,
                }));
              } else if (event.content) {
                upsertAssistantBlock((block) => ({
                  ...block,
                  text: (block.text ?? "") + event.content,
                }));
              }
            } catch {
              /* skip */
            }
          }
        }
      }

      setChat((c) => {
        const last = c[c.length - 1];
        if (last?.role === "assistant") return c;
        return [...c, { role: "assistant", text: "No response from agent." }];
      });
    } catch (e) {
      setChat((c) => [
        ...c,
        {
          role: "assistant",
          text: `Error: ${e instanceof Error ? e.message : e}`,
        },
      ]);
    } finally {
      setLoading(false);
      setPipelineStatus(null);
      void loadThreads();
    }
  }

  const canSend = Boolean(message.trim()) && !loading;

  return (
    <div className="home-layout">
      <aside className="setup-panel">
        <section className="panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <h2 className="panel-title">What do you want to build?</h2>
          {useCase && (
            <button
              type="button"
              onClick={() => {
                setUseCase("");
                setAgentPickedUseCase(false);
              }}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--muted)",
                borderRadius: 8,
                padding: "0.25rem 0.65rem",
                fontSize: "0.8rem",
              }}
            >
              Clear
            </button>
          )}
        </div>
        <input
          style={{ width: "100%", marginBottom: agentPickedUseCase && useCase ? "0.35rem" : "0.75rem" }}
          placeholder="e.g. Fraud detection on credit card transactions"
          value={useCase}
          onChange={(e) => {
            setUseCase(e.target.value);
            setAgentPickedUseCase(false);
          }}
        />
        {agentPickedUseCase && useCase && (
          <div style={{ marginBottom: "0.75rem", fontSize: "0.75rem", color: "var(--accent)" }}>
            Use case inferred from your chat
          </div>
        )}
        <div className="chip-row">
          {USE_CASE_CHIPS.map((chip) => {
            const selected = useCase === chip;
            return (
              <button
                key={chip}
                type="button"
                className={`chip${selected ? " selected" : ""}`}
                onClick={() => {
                  setUseCase(chip);
                  setAgentPickedUseCase(false);
                }}
              >
                {chip}
                {selected && agentPickedUseCase && (
                  <span style={{ marginLeft: "0.35rem", fontSize: "0.7rem", opacity: 0.85 }}>
                    AI
                  </span>
                )}
              </button>
            );
          })}
        </div>
        </section>

        <section className="panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <h2 className="panel-title">Architecture (on-chain CPU)</h2>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {["", "low", "mid"].map((t) => (
              <button
                key={t || "all"}
                type="button"
                onClick={() => setTierFilter(t)}
                style={{
                  background: tierFilter === t ? "var(--accent)" : "var(--border)",
                  border: "none",
                  color: "var(--text)",
                  borderRadius: 8,
                  padding: "0.3rem 0.6rem",
                  fontSize: "0.8rem",
                }}
              >
                {t || "all"}
              </button>
            ))}
            {architectureId && (
              <button
                type="button"
                onClick={() => {
                  setArchitectureId("");
                  setAgentPickedArch(false);
                }}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--muted)",
                  borderRadius: 8,
                  padding: "0.25rem 0.65rem",
                  fontSize: "0.8rem",
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
        {selectedArch && (
          <div
            style={{
              marginBottom: "0.75rem",
              fontSize: "0.8rem",
              color: "var(--accent)",
            }}
          >
            Selected: <strong>{selectedArch.name}</strong> ({selectedArch.id})
            {agentPickedArch && (
              <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>· picked by agent</span>
            )}
          </div>
        )}
        <div className="arch-grid">
          {architectures.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`arch-card${architectureId === a.id ? " selected" : ""}`}
              onClick={() => {
                setArchitectureId(a.id);
                setAgentPickedArch(false);
              }}
            >
              <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{a.name}</div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                {a.tier} · {a.taskType} · ≤{a.maxInputDim} features
              </div>
            </button>
          ))}
        </div>
        </section>
      </aside>

      <section className="panel chat-panel">
        {agentError && (
          <div className="agent-error-banner">
            <strong>Agent error:</strong> {agentError}. Run{" "}
            <code>npm run dev:agent</code> from the project root (port 8000).
          </div>
        )}
        <div className="chat-panel-header">
          <h2>Agent chat</h2>
          <select
            className="chat-thread-select"
            value={threadId ?? ""}
            onChange={(e) => {
              const id = e.target.value;
              if (id) void loadThread(id);
              else startNewChat();
            }}
          >
            <option value="">New chat</option>
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                {(t.title || "Chat").slice(0, 48)}
              </option>
            ))}
          </select>
        </div>
        {useCase && architectureId && selectedArch && (
          <div className="chat-selection-bar">
            <strong>Selection:</strong> {useCase} · {selectedArch.name} ({architectureId}) · 2
            samples, 1 epoch
          </div>
        )}
        <p className="chat-hint">
          Describe what you want to build in the chat — the agent can pick use case, architecture,
          and a Kaggle dataset for you.
        </p>
        {loading && pipelineStatus && (
          <div
            style={{
              flexShrink: 0,
              marginBottom: "0.5rem",
              padding: "0.5rem 0.75rem",
              background: "rgba(61, 156, 245, 0.12)",
              border: "1px solid var(--accent)",
              borderRadius: 8,
              fontSize: "0.82rem",
              color: "var(--accent)",
            }}
          >
            {pipelineStatus}
            {acpStatus?.progress_pct != null ? ` · ACP ${acpStatus.progress_pct}%` : ""}
          </div>
        )}
        <div className="chat-messages">
          {chat.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
              Try: &quot;Build a fraud detection model on credit card data&quot; — no need to pick
              buttons first.
            </p>
          )}
          {chat.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: m.role === "user" ? "85%" : "100%",
                width:
                  m.role === "assistant" && (m.dataset || m.datasets) ? "100%" : undefined,
              }}
            >
              {m.text && (
                <div
                  style={{
                    background: m.role === "user" ? "var(--accent-dim)" : "var(--bg)",
                    borderRadius: 10,
                    padding: "0.6rem 0.85rem",
                    fontSize: "0.9rem",
                    ...(m.role === "user" ? { whiteSpace: "pre-wrap" } : {}),
                  }}
                >
                  {m.role === "assistant" ? (
                    <ChatMarkdown content={m.text} />
                  ) : (
                    m.text
                  )}
                </div>
              )}
              {m.role === "assistant" && m.dataset && (
                <RecommendedDatasetCard
                  dataset={m.dataset}
                  onStartTraining={handleStartTraining}
                  onShowAlternatives={handleShowAlternatives}
                />
              )}
              {m.role === "assistant" && m.datasets && m.datasets.length > 0 && (
                <DatasetCards datasets={m.datasets} onSelect={handleDatasetSelect} />
              )}
              {m.role === "assistant" && m.job && <JobCard job={m.job} />}
            </div>
          ))}
        </div>
        <div className="chat-input-row">
          <input
            placeholder="Message the agent…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSend && sendChat()}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => sendChat()}
            disabled={!canSend}
            style={{
              background: "var(--accent)",
              border: "none",
              color: "#fff",
              borderRadius: 8,
              padding: "0 1.25rem",
              opacity: canSend ? 1 : 0.5,
            }}
          >
            {loading ? "…" : "Send"}
          </button>
        </div>
      </section>
    </div>
  );
}
