"use client";

import { useState } from "react";
import { Check, Copy, ImageDown, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { rankCardUrl, tweetIntentUrl } from "@/lib/share";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

// Every way to share a profile, behind one button.
//
// The X logo used to be its own icon button beside the share icon, a few
// pixels from the Discord/Twitch/start.gg icons that DO open that player's
// profile on those services — so it read as "this player's X account", which
// the site cannot even know: nothing stores an X handle. Folding it in here
// puts the action in words ("Share on X") and leaves a single icon whose
// meaning is unambiguous.
export function ShareMenu({
  url,
  text,
  playerId,
  lang,
}: {
  url: string;
  text: string;
  playerId: string;
  lang: Lang;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard permission (or no secure context) — the menu stays open
      // showing the unchanged "Copy link", rather than claiming a copy that
      // did not happen.
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={tr(lang, { en: "Share", es: "Compartir", ja: "共有" })}
          title={tr(lang, { en: "Share", es: "Compartir", ja: "共有" })}
          className="text-muted-foreground hover:text-foreground"
        >
          <Share2 className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {/* preventDefault keeps the menu open so the "Copied" tick is seen. */}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void copyLink();
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          <span className="flex-1">
            {copied
              ? tr(lang, { en: "Copied!", es: "¡Copiado!", ja: "コピーしました！" })
              : tr(lang, { en: "Copy link", es: "Copiar enlace", ja: "リンクをコピー" })}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={tweetIntentUrl(text, url)} target="_blank" rel="noopener noreferrer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span className="flex-1">{tr(lang, { en: "Share on X", es: "Compartir en X", ja: "Xでシェア" })}</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={rankCardUrl(playerId)} target="_blank" rel="noreferrer">
            <ImageDown className="size-3.5" />
            <span className="flex-1">{tr(lang, { en: "Rank card image", es: "Tarjeta de clasificación", ja: "ランクカード画像" })}</span>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
