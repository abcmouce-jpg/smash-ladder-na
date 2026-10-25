import { Info } from "lucide-react";
import { RankTierList } from "@/components/rank-tier-list";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

// The tier-info dialog, opened from the "How do tiers work?" link on the
// leaderboard page. Holds no open/close state of its own — Radix's Dialog
// tracks that internally — so this stays a Server Component and ships no
// client JS beyond the primitive itself.
//
// The trigger renders as a <button>, not an <a>, so cursor-pointer is needed:
// Tailwind's preflight already makes it inherit the surrounding text's size
// and color, but the browser still gives a bare <button> an arrow cursor
// where an <a href> gets a pointer, which is the one visible difference.
export function InfoPopup({ lang }: { lang: Lang }) {
  return (
    <Dialog>
      <DialogTrigger className="text-sm text-muted-foreground hover:underline cursor-pointer">
        {tr(lang, { en: "How do tiers work?", es: "¿Cómo funcionan los rangos?", ja: "ランクの仕組みは？" })}
      </DialogTrigger>
      <DialogContent>
        <div className="flex items-center gap-2">
          <Info className="size-5 text-muted-foreground" />
          <DialogTitle>{tr(lang, { en: "How Tiers Work", es: "Cómo funcionan los rangos", ja: "ランクの仕組み" })}</DialogTitle>
        </div>
        <DialogDescription className="mt-3">
          {tr(lang, {
            en: "Every rank a player can hold, highest first. Your rank comes from your ladder rating, which starts at 1500 and moves after every confirmed ranked set.",
            es: "Todos los rangos que puede tener un jugador, de mayor a menor. Tu rango depende de tu clasificación en la liga, que empieza en 1500 y cambia con cada partida rankeada confirmada.",
            ja: "プレイヤーが到達できるすべてのランクを、上位から順に表示しています。ランクはラダーのレートで決まります。レートは1500から始まり、ランクマッチのセットが確定するたびに変動します。",
          })}
        </DialogDescription>

        <RankTierList className="mt-5" lang={lang} />
      </DialogContent>
    </Dialog>
  );
}
