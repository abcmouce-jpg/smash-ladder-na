"use client";

import { useState } from "react";
import { ChatMessages } from "@/components/chat-messages";

type Comment = {
  id: string;
  author: { username: string };
  body: string;
  createdAt: string;
};

// Chat logs for old matches aren't preloaded with the rest of match
// history (a long career could have hundreds of them) — fetched once, on
// first expand, via the passed-in server action. Rendered inside the
// match-details modal, which scrolls as a whole, so the log itself doesn't
// cap its own height (a nested scrollbar in a scrolling panel is janky).
export function MatchChatLog({ action }: { action: () => Promise<Comment[]> }) {
  const [state, setState] = useState<
    { status: "collapsed" } | { status: "loading" } | { status: "error" } | { status: "loaded"; comments: Comment[] }
  >({ status: "collapsed" });

  async function expand() {
    setState({ status: "loading" });
    try {
      const comments = await action();
      setState({ status: "loaded", comments });
    } catch {
      setState({ status: "error" });
    }
  }

  if (state.status === "collapsed") {
    return (
      <button
        type="button"
        onClick={expand}
        className="mt-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        View chat log
      </button>
    );
  }

  return (
    <div className="mt-1.5 rounded-lg border border-border bg-muted/30 p-2">
      {state.status === "loading" && <p className="text-xs text-muted-foreground">Loading…</p>}
      {state.status === "error" && (
        <p className="text-xs text-destructive">Couldn&apos;t load chat log — try again.</p>
      )}
      {state.status === "loaded" && (
        <ChatMessages
          comments={state.comments}
          empty={<p className="text-xs text-muted-foreground">No messages were sent in this set.</p>}
        />
      )}
    </div>
  );
}
