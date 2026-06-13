"use client";

import { useEffect, useState } from "react";
import { PanelRightClose, PanelRightOpen, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Ap2AuthorizeOverlay } from "@/components/Ap2AuthorizeOverlay";
import type { Ap2Payment, Architecture, ChatBlock, ChatThread } from "@/components/agent/types";
import { ChatMessage } from "@/components/agent/ChatMessage";
import { ConfigSummary } from "@/components/agent/ConfigSummary";
import {
  ChatComposer,
  ChatWindowChrome,
  TypingIndicator,
} from "@/components/agent/ChatChrome";
import { PaymentHistoryModal } from "@/components/agent/PaymentHistoryModal";
import { PipelineStatus } from "@/components/agent/PipelineStatus";
import { SetupPanel } from "@/components/agent/SetupPanel";
import { ThreadList } from "@/components/agent/ThreadList";
import { useStickToBottom } from "@/lib/hooks/use-stick-to-bottom";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  agentError: string | null;
  ap2Payments: Ap2Payment[];
  onLoadAp2Payments?: () => Promise<void>;
  ap2SessionActive: boolean;
  showAp2Overlay: boolean;
  ap2SetupLoading: boolean;
  ap2SetupStatus: string | null;
  ap2SetupError?: string | null;
  onAuthorize: () => void;
  threadId: string | null;
  threads: ChatThread[];
  useCase: string;
  agentPickedUseCase: boolean;
  agentPickedArch: boolean;
  tierFilter: string;
  architectureId: string;
  architectures: Architecture[];
  selectedArch?: Architecture;
  chat: ChatBlock[];
  message: string;
  loading: boolean;
  pipelineStatus: string | null;
  jobProgressPct?: number;
  threadsLoading?: boolean;
  onCreateFirstChat?: () => void;
  onThreadChange: (id: string) => void;
  onNewChat?: () => void;
  onRenameThread?: (id: string, title: string) => Promise<void>;
  onMessageChange: (value: string) => void;
  onSend: () => void;
  onUseCaseChange: (value: string) => void;
  onClearUseCase: () => void;
  onPresetSelect: (preset: string) => void;
  onTierFilterChange: (tier: string) => void;
  onArchitectureSelect: (id: string) => void;
  onClearArchitecture: () => void;
  onStartTraining: (ref: string, title: string) => void;
  onShowAlternatives: () => void;
  onDatasetSelect: (ref: string, title: string) => void;
}

export function ChatPanel({
  agentError,
  ap2Payments,
  onLoadAp2Payments,
  ap2SessionActive,
  showAp2Overlay,
  ap2SetupLoading,
  ap2SetupStatus,
  ap2SetupError,
  onAuthorize,
  threadId,
  threads,
  useCase,
  agentPickedUseCase,
  agentPickedArch,
  tierFilter,
  architectureId,
  architectures,
  selectedArch,
  chat,
  message,
  loading,
  pipelineStatus,
  jobProgressPct,
  threadsLoading = false,
  onCreateFirstChat,
  onThreadChange,
  onNewChat,
  onRenameThread,
  onMessageChange,
  onSend,
  onUseCaseChange,
  onClearUseCase,
  onPresetSelect,
  onTierFilterChange,
  onArchitectureSelect,
  onClearArchitecture,
  onStartTraining,
  onShowAlternatives,
  onDatasetSelect,
}: ChatPanelProps) {
  const [setupOpen, setSetupOpen] = useState(true);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const { viewportRef, followOutput, enableStickToBottom } = useStickToBottom();
  const chatLocked = !ap2SessionActive;
  const canSend = Boolean(message.trim()) && !loading && ap2SessionActive;
  const isEmpty = chat.length === 0;
  const showTyping = loading && !pipelineStatus;
  const showEmptyLanding = threads.length === 0 && !threadsLoading;
  const currentThread = threads.find((t) => t.id === threadId);
  const chatTitle = currentThread?.title || useCase || "Chat";

  async function openPaymentHistory() {
    setPaymentsOpen(true);
    if (!onLoadAp2Payments) return;
    setPaymentsLoading(true);
    try {
      await onLoadAp2Payments();
    } finally {
      setPaymentsLoading(false);
    }
  }

  useEffect(() => {
    enableStickToBottom("auto");
  }, [threadId, enableStickToBottom]);

  useEffect(() => {
    followOutput();
  }, [chat, loading, showTyping, followOutput]);

  function handleSend() {
    enableStickToBottom("auto");
    onSend();
  }

  if (showEmptyLanding) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Start training models with the POCU agent
          </p>
          <Button
            type="button"
            className="mt-4 rounded-full bg-accent px-6 text-accent-foreground hover:bg-accent-hover"
            onClick={onCreateFirstChat}
          >
            Create your first chat
          </Button>
        </div>
      </div>
    );
  }

  if (!threadId) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        {threadsLoading ? "Loading.." : "Select a chat"}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-h-0 min-w-0 gap-4">
      <aside className="flex w-72 shrink-0 min-h-0 flex-col overflow-hidden">
        <ThreadList
          threadId={threadId}
          threads={threads}
          onChange={onThreadChange}
          onNewChat={onNewChat}
          onRenameThread={onRenameThread}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatWindowChrome
          overlay={
            showAp2Overlay ? (
              <Ap2AuthorizeOverlay
                loading={ap2SetupLoading}
                statusMessage={ap2SetupStatus}
                errorMessage={ap2SetupError}
                onAuthorize={onAuthorize}
              />
            ) : undefined
          }
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/50 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-foreground">
                Training Agent
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Describe a model — I&apos;ll find data and queue training
              </p>
              {(useCase || architectureId) && (
                <ConfigSummary
                  useCase={useCase}
                  architectureId={architectureId}
                  selectedArch={selectedArch}
                  className="mt-3"
                />
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => void openPaymentHistory()}
                className={cn(
                  "relative flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border/60 px-3 text-xs font-medium leading-none text-muted-foreground transition-colors hover:bg-surface hover:text-foreground",
                  paymentsOpen && "border-primary/30 text-primary"
                )}
                title="Payment history"
                aria-label="Payment history"
              >
                <Receipt className="h-3.5 w-3.5 shrink-0" />
                Payments
                {ap2Payments.length > 0 ? (
                  <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary">
                    {ap2Payments.length}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setSetupOpen((o) => !o)}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors duration-200 hover:bg-surface hover:text-foreground",
                  setupOpen && "border-primary/30 text-primary"
                )}
                title={setupOpen ? "Hide setup" : "Show setup"}
                aria-expanded={setupOpen}
                aria-label={setupOpen ? "Hide setup panel" : "Show setup panel"}
              >
                {setupOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {agentError && (
            <div className="mx-5 mt-3 shrink-0 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              {agentError}
            </div>
          )}

          <div
            ref={viewportRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <div className="flex flex-col gap-5 px-5 py-5">
              {isEmpty && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-sm font-medium text-foreground">
                    Start a conversation
                  </p>
                  <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
                    Try asking for a fraud detection model or any ML use case.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4 border-border text-foreground hover:bg-surface"
                    onClick={() =>
                      onMessageChange(
                        "Build a fraud detection model on credit card data"
                      )
                    }
                  >
                    Try an example
                  </Button>
                </div>
              )}

              {chat.map((block, i) => (
                <ChatMessage
                  key={i}
                  block={block}
                  onStartTraining={onStartTraining}
                  onShowAlternatives={onShowAlternatives}
                  onDatasetSelect={onDatasetSelect}
                />
              ))}

              {showTyping && <TypingIndicator />}
            </div>
          </div>

          {loading && pipelineStatus && (
            <div className="shrink-0 border-t border-border/50 px-5 py-2.5">
              <PipelineStatus
                message={pipelineStatus}
                progressPct={jobProgressPct}
              />
            </div>
          )}

          <ChatComposer
            value={message}
            onChange={onMessageChange}
            onSend={handleSend}
            disabled={loading || chatLocked}
            loading={loading}
            canSend={canSend}
            placeholder="Describe what you want to build…"
          />
        </ChatWindowChrome>
      </div>

      <aside
        className={cn(
          "shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          setupOpen ? "w-72 opacity-100" : "pointer-events-none w-0 opacity-0"
        )}
        aria-hidden={!setupOpen}
      >
        <div
          className={cn(
            "h-full w-72 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            setupOpen ? "translate-x-0" : "translate-x-3"
          )}
        >
          <SetupPanel
            useCase={useCase}
            agentPickedUseCase={agentPickedUseCase}
            agentPickedArch={agentPickedArch}
            tierFilter={tierFilter}
            architectureId={architectureId}
            architectures={architectures}
            selectedArch={selectedArch}
            onUseCaseChange={onUseCaseChange}
            onClearUseCase={onClearUseCase}
            onPresetSelect={onPresetSelect}
            onTierFilterChange={onTierFilterChange}
            onArchitectureSelect={onArchitectureSelect}
            onClearArchitecture={onClearArchitecture}
          />
        </div>
      </aside>

      <PaymentHistoryModal
        open={paymentsOpen}
        chatTitle={chatTitle}
        payments={ap2Payments}
        loading={paymentsLoading}
        onClose={() => setPaymentsOpen(false)}
      />
    </div>
  );
}
