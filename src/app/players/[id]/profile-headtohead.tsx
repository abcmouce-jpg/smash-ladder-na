import Link from "next/link";
import { getHeadToHeadOpponents } from "@/lib/profile-stats";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";
import { HeadToHeadList } from "./head-to-head-list";

const HEAD_TO_HEAD_PAGE_SIZE = 20;

// Every opponent this player has ever faced in ranked play, ranked by games
// played — the "who do they run into most, and how does it go?" tab. Paged so a
// long career doesn't render one enormous list; rows link through to the
// opponent's own profile.
export async function ProfileHeadToHeadSection({ id, page, lang }: { id: string; page: number; lang: Lang }) {
  const { opponents, total } = await getHeadToHeadOpponents(id, {
    limit: HEAD_TO_HEAD_PAGE_SIZE,
    skip: (page - 1) * HEAD_TO_HEAD_PAGE_SIZE,
  });

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {tr(lang, { en: "No opponents recorded yet.", es: "Aún no hay oponentes registrados.", ja: "まだ対戦相手の記録はありません。" })}
      </p>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / HEAD_TO_HEAD_PAGE_SIZE));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {tr(lang, {
            en: `${total} distinct ${total === 1 ? "opponent" : "opponents"}`,
            es: `${total} ${total === 1 ? "oponente distinto" : "oponentes distintos"}`,
            ja: `対戦相手 ${total}人`,
          })}
        </p>
        {totalPages > 1 && (
          <HeadToHeadPaginationControls playerId={id} page={page} totalPages={totalPages} lang={lang} />
        )}
      </div>
      <HeadToHeadList opponents={opponents} lang={lang} className="mt-3" />
    </div>
  );
}

function HeadToHeadPaginationControls({
  playerId,
  page,
  totalPages,
  lang,
}: {
  playerId: string;
  page: number;
  totalPages: number;
  lang: Lang;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <HeadToHeadPageLink playerId={playerId} page={page - 1} disabled={page <= 1}>
        {tr(lang, { en: "← Previous", es: "← Anterior", ja: "← 前へ" })}
      </HeadToHeadPageLink>
      <span className="text-muted-foreground tabular-nums">
        {tr(lang, { en: `Page ${page} of ${totalPages}`, es: `Página ${page} de ${totalPages}`, ja: `${page} / ${totalPages} ページ` })}
      </span>
      <HeadToHeadPageLink playerId={playerId} page={page + 1} disabled={page >= totalPages}>
        {tr(lang, { en: "Next →", es: "Siguiente →", ja: "次へ →" })}
      </HeadToHeadPageLink>
    </div>
  );
}

function HeadToHeadPageLink({
  playerId,
  page,
  disabled,
  children,
}: {
  playerId: string;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-muted-foreground/40">{children}</span>;
  }
  // Pinned to the Head 2 Heads tab so paging keeps the tab strip where the user
  // left it instead of silently dropping back to a bare `/players/:id` URL.
  return (
    <Link href={`/players/${playerId}?tab=headtohead&page=${page}`} prefetch={false} className="hover:underline">
      {children}
    </Link>
  );
}
