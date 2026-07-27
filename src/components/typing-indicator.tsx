"use client";

export function TypingIndicator({ opponentName }: { opponentName: string }) {
  return (
    <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-0.5">
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
      </span>
      <span>{opponentName} is typing…</span>
    </div>
  );
}
