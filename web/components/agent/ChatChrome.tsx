import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function TypingIndicator() {
  return (
    <div className="flex items-start">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-border/60 bg-surface px-4 py-3">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
      </div>
    </div>
  );
}

export function ChatWindowChrome({
  children,
  className,
  overlay,
}: {
  children: ReactNode;
  className?: string;
  overlay?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "floating-card relative flex h-full min-h-0 flex-col overflow-hidden",
        className
      )}
    >
      {children}
      {overlay}
    </div>
  );
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  loading,
  canSend,
  placeholder = "Message the training agent…",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  loading?: boolean;
  canSend: boolean;
  placeholder?: string;
}) {
  return (
    <div className="shrink-0 border-t border-border/50 p-4">
      <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-surface p-2 pl-4 focus-within:border-primary/40">
        <textarea
          rows={1}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && canSend) {
              e.preventDefault();
              onSend();
            }
          }}
          disabled={disabled}
          className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className={cn(
            "mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-medium transition-colors",
            canSend
              ? "bg-accent text-accent-foreground hover:bg-accent-hover"
              : "bg-muted text-muted-foreground"
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span aria-hidden>↑</span>
          )}
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-subtle">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
