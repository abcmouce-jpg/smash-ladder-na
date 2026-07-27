"use client";

import { useActionState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";

type SendCommentState = { error: string | null };

const TYPING_DEBOUNCE_MS = 2_000;

export function CommentForm({
  action,
  onTyping,
}: {
  action: (prevState: SendCommentState, formData: FormData) => Promise<SendCommentState>;
  onTyping?: () => void | Promise<void>;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null });
  const lastTypingSignal = useRef(0);

  const handleInput = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSignal.current > TYPING_DEBOUNCE_MS) {
      lastTypingSignal.current = now;
      // Fire-and-forget the typing signal — it's non-critical
      Promise.resolve(onTyping?.()).catch(() => {});
    }
  }, [onTyping]);

  return (
    <div className="mt-3 flex flex-col gap-1">
      <form action={formAction} className="flex gap-2" autoComplete="off">
        <input
          name="body"
          placeholder="Say something…"
          maxLength={500}
          autoComplete="off"
          onInput={handleInput}
          className="h-8 flex-1 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
        <Button type="submit" size="sm" disabled={isPending}>
          Send
        </Button>
      </form>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}
