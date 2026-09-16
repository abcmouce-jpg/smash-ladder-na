"use client";

import { Radio } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { useLiveStreamSelection } from "./selection";

// Replaces the little live dot beside a feed-row username: points the pinned
// player at that side's channel and scrolls back to the top of the page so
// the player above is in view. Because each side gets its own button, both
// channels of a doubly-streamed set stay reachable. Padded up on phones so it
// is a usable touch target, and kept from wrapping so it never pushes into
// the score beside it.
export function OpenStreamButton({ matchId, playerId, lang }: { matchId: string; playerId: string; lang: Lang }) {
  const { select } = useLiveStreamSelection();

  return (
    <button
      type="button"
      onClick={(event) => {
        // The row itself toggles open on click; don't let the button trigger it.
        event.stopPropagation();
        select(matchId, playerId);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      onKeyDown={(event) => event.stopPropagation()}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-500/40 px-2 py-1 text-[11px] font-medium whitespace-nowrap text-red-500 transition-colors hover:bg-red-500/10 sm:px-1.5 sm:py-0.5 sm:text-[10px]"
    >
      <Radio className="size-2.5" aria-hidden />
      {lang === "es" ? "Abrir stream" : "Open stream"}
    </button>
  );
}
