"use client";

import { useState } from "react";
import { ChatMessages } from "@/components/chat-messages";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

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
export function MatchChatLog({ action, lang = "en" }: { action: () => Promise<Comment[]>; lang?: Lang }) {
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
        {tr(lang, { en: "View chat log", es: "Ver registro de chat", ja: "チャットログを見る" })}
      </button>
    );
  }

  return (
    <div className="mt-1.5 rounded-lg border border-border bg-muted/30 p-2">
      {state.status === "loading" && (
        <p className="text-xs text-muted-foreground">
          {tr(lang, { en: "Loading…", es: "Cargando…", ja: "読み込み中…" })}
        </p>
      )}
      {state.status === "error" && (
        <p className="text-xs text-destructive">
          {tr(lang, {
            en: "Couldn't load chat log — try again.",
            es: "No se pudo cargar el chat — inténtalo de nuevo.",
            ja: "チャットログを読み込めませんでした。もう一度お試しください。",
          })}
        </p>
      )}
      {state.status === "loaded" && (
        <ChatMessages
          comments={state.comments}
          empty={
            <p className="text-xs text-muted-foreground">
              {tr(lang, {
                en: "No messages were sent in this set.",
                es: "No se envió ningún mensaje en esta partida.",
                ja: "このセットではメッセージが送られていません。",
              })}
            </p>
          }
        />
      )}
    </div>
  );
}
