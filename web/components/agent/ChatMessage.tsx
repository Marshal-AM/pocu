import { ChatMarkdown } from "@/app/components/ChatMarkdown";
import { cn } from "@/lib/utils";
import type { ChatBlock } from "@/components/agent/types";
import { stripChatFileSizes } from "@/components/agent/chat-text";
import { RecommendedDatasetCard, DatasetGrid } from "@/components/agent/DatasetCard";
import { JobQueuedCard } from "@/components/agent/JobQueuedCard";

function isStatusOnlyText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  const statusPatterns = [
    /^Starting training pipeline/i,
    /^Inspect:/i,
    /^Prepared:/i,
    /^Downloading/i,
    /^Queueing/i,
    /^Signing/i,
  ];
  return statusPatterns.some((p) => p.test(t));
}

interface ChatMessageProps {
  block: ChatBlock;
  onStartTraining: (ref: string, title: string) => void;
  onShowAlternatives: () => void;
  onDatasetSelect: (ref: string, title: string) => void;
}

export function ChatMessage({
  block,
  onStartTraining,
  onShowAlternatives,
  onDatasetSelect,
}: ChatMessageProps) {
  const isUser = block.role === "user";
  const showText =
    block.text &&
    !(block.role === "assistant" && isStatusOnlyText(block.text) && block.dataset);

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2",
        isUser ? "items-end" : "items-start"
      )}
    >
      {showText && (
        <div
          className={cn(
            "max-w-[90%] text-sm leading-relaxed sm:max-w-[80%]",
            isUser
              ? "rounded-2xl rounded-tr-md bg-primary/10 px-4 py-3 whitespace-pre-wrap text-foreground"
              : "rounded-2xl rounded-tl-md border border-border/60 bg-surface px-4 py-3 text-foreground"
          )}
        >
          {isUser ? block.text : <ChatMarkdown content={stripChatFileSizes(block.text!)} />}
        </div>
      )}

      {block.role === "assistant" && block.dataset && (
        <RecommendedDatasetCard
          dataset={block.dataset}
          onStartTraining={onStartTraining}
          onShowAlternatives={onShowAlternatives}
        />
      )}
      {block.role === "assistant" && block.datasets && block.datasets.length > 0 && (
        <DatasetGrid datasets={block.datasets} onSelect={onDatasetSelect} />
      )}
      {block.role === "assistant" && block.job && (
        <JobQueuedCard job={block.job} />
      )}
    </div>
  );
}
