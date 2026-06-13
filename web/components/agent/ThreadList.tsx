"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import type { ChatThread } from "@/components/agent/types";
import { cn } from "@/lib/utils";

interface ThreadListProps {
  threadId: string | null;
  threads: ChatThread[];
  onChange: (id: string) => void;
  onNewChat?: () => void;
  onRenameThread?: (id: string, title: string) => Promise<void>;
}

export function ThreadList({
  threadId,
  threads,
  onChange,
  onNewChat,
  onRenameThread,
}: ThreadListProps) {
  const [renaming, setRenaming] = useState<ChatThread | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  function openRename(thread: ChatThread, e: React.MouseEvent) {
    e.stopPropagation();
    setRenaming(thread);
    setRenameValue(thread.title || "Chat");
  }

  async function submitRename() {
    if (!renaming || !onRenameThread) return;
    const title = renameValue.trim();
    if (!title) return;
    setRenameSaving(true);
    try {
      await onRenameThread(renaming.id, title);
      setRenaming(null);
    } finally {
      setRenameSaving(false);
    }
  }

  return (
    <>
      <div className="floating-card flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-3">
          <h3 className="text-sm font-medium text-foreground">Chats</h3>
          {onNewChat && (
            <button
              type="button"
              onClick={onNewChat}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-primary/30 hover:bg-surface hover:text-primary"
              aria-label="New chat"
              title="New chat"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {threads.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              No chats yet.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {threads.map((t) => (
                <li key={t.id}>
                  <div
                    className={cn(
                      "group flex w-full items-center gap-1 rounded-xl transition-colors",
                      threadId === t.id
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-surface hover:text-foreground"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onChange(t.id)}
                      className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm"
                    >
                      {(t.title || "Chat").slice(0, 48)}
                    </button>
                    {onRenameThread && (
                      <button
                        type="button"
                        onClick={(e) => openRename(t, e)}
                        className="mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-background/60 hover:text-foreground group-hover:opacity-100"
                        aria-label={`Rename ${t.title || "chat"}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {renaming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-[4px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="floating-card w-full max-w-sm p-5 shadow-lg">
            <h3 className="text-sm font-semibold text-foreground">Rename chat</h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitRename();
                if (e.key === "Escape") setRenaming(null);
              }}
              className="mt-3 w-full rounded-xl border border-border/60 bg-surface px-3 py-2 text-sm text-foreground focus:border-primary/40 focus:outline-none"
              autoFocus
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setRenaming(null)}
                disabled={renameSaving}
                className="flex-1 rounded-full border border-border/60 px-4 py-2 text-sm text-muted-foreground hover:bg-surface hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitRename()}
                disabled={renameSaving || !renameValue.trim()}
                className="flex-1 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
              >
                {renameSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
