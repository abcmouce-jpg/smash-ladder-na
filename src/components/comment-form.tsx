"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

type SendCommentState = { error: string | null };

export function CommentForm({
  action,
}: {
  action: (prevState: SendCommentState, formData: FormData) => Promise<SendCommentState>;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null });

  return (
    <div className="mt-3 flex flex-col gap-1">
      <form action={formAction} className="flex gap-2">
        <input
          name="body"
          placeholder="Say something…"
          maxLength={500}
          autoComplete="off"
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
