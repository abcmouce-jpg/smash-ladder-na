"use client";

import { useActionState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_QUICK_MESSAGES } from "@/lib/quick-messages";

type SendCommentState = { error: string | null };

const TYPING_DEBOUNCE_MS = 2_000;

export function CommentForm({
  action,
  onTyping,
  quickMessages = DEFAULT_QUICK_MESSAGES,
  lang = "en",
}: {
  action: (prevState: SendCommentState, formData: FormData) => Promise<SendCommentState>;
  onTyping?: () => void | Promise<void>;
  // Already resolved (defaults merged in per-slot) by the caller — see
  // resolveQuickMessages in lib/quick-messages.ts. Falls back to the site
  // default here too so callers that haven't been updated still work.
  quickMessages?: string[];
  lang?: "en" | "es";
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null });
  const lastTypingSignal = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInput = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSignal.current > TYPING_DEBOUNCE_MS) {
      lastTypingSignal.current = now;
      // Fire-and-forget the typing signal — it's non-critical
      Promise.resolve(onTyping?.()).catch(() => {});
    }
  }, [onTyping]);

  function sendQuickMessage(message: string) {
    if (!inputRef.current || !formRef.current) return;
    inputRef.current.value = message;
    formRef.current.requestSubmit();
  }

  return (
    <div className="mt-3 flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {quickMessages.map((message) => (
          <Button
            key={message}
            type="button"
            size="xs"
            variant="outline"
            disabled={isPending}
            onClick={() => sendQuickMessage(message)}
          >
            {message}
          </Button>
        ))}
      </div>
      <form ref={formRef} action={formAction} className="flex gap-2" autoComplete="off">
        <input
          ref={inputRef}
          name="body"
          placeholder={lang === "es" ? "Escribe algo…" : "Say something…"}
          maxLength={500}
          autoComplete="off"
          onInput={handleInput}
          className="h-8 flex-1 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
        <Button type="submit" size="sm" disabled={isPending}>
          {lang === "es" ? "Enviar" : "Send"}
        </Button>
      </form>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}
