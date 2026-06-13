"use client";

import { useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Ap2AuthorizeOverlay } from "@/components/Ap2AuthorizeOverlay";
import type { Architecture, ChatBlock, ChatThread } from "@/components/agent/types";
import { ChatMessage } from "@/components/agent/ChatMessage";
import { ConfigSummary } from "@/components/agent/ConfigSummary";
import {
  ChatComposer,
  ChatWindowChrome,
  TypingIndicator,
} from "@/components/agent/ChatChrome";
import { PipelineStatus } from "@/components/agent/PipelineStatus";
import { SetupPanel } from "@/components/agent/SetupPanel";
import { ThreadList } from "@/components/agent/ThreadList";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  agentError: string | null;
  ap2SettlementNote?: string | null;
  ap2SessionActive: boolean;
  ap2SetupLoading: boolean;
  ap2SetupStatus: string | null;
  ap2SetupError?: string | null;
  onAuthorize: () => void;
  onDismissAuthorize: () => void;
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
  ap2SettlementNote,
  ap2SessionActive,
  ap2SetupLoading,
  ap2SetupStatus,
  ap2SetupError,
  onAuthorize,
  onDismissAuthorize,
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
  const chatLocked = !ap2SessionActive;
  const canSend = Boolean(message.trim()) && !loading && ap2SessionActive;
  const isEmpty = chat.length === 0;
  const showTyping = loading && !pipelineStatus;
  const showEmptyLanding = threads.length === 0 && !threadsLoading;

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
        {threadsLoading ? "Loading chats…" : "Select a chat"}
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
            chatLocked ? (
              <Ap2AuthorizeOverlay
                loading={ap2SetupLoading}
                statusMessage={ap2SetupStatus}
                errorMessage={ap2SetupError}
                onAuthorize={onAuthorize}
                onCancel={onDismissAuthorize}
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

          {agentError && (
            <div className="mx-5 mt-3 shrink-0 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              {agentError}
            </div>
          )}

          {ap2SettlementNote && (
            <div className="mx-5 mt-3 shrink-0 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-muted-foreground">
              {ap2SettlementNote}
            </div>
          )}

          <ScrollArea className="min-h-0 flex-1">
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
          </ScrollArea>

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
            onSend={onSend}
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
    </div>
  );
}
