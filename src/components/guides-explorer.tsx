"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CharacterSelect } from "@/components/character-select";
import { OptionSelect } from "@/components/option-select";
import { ExpandableTextarea } from "@/components/expandable-textarea";
import { GuideCard, type Guide } from "@/components/character-guide-section";
import { echoGroupCanonical, echoGroupLabel, MATCHUP_CHARACTERS, type SmashCharacter } from "@/lib/characters";
import type { Lang } from "@/lib/i18n";
import type { GuideActionState, GuideFormState } from "@/app/notes/actions";
import { tr } from "@/lib/lang";

// Guides per page on the ungrouped tab. Guides can run long, so this is set
// well below the leaderboard's 50 to keep a page scannable.
const PAGE_SIZE = 10;

// How the Guides tab orders what's shown. "newest" is the default — guides
// are worth reading the day they land, and a fresh guide with no votes yet
// would otherwise sink below established ones.
type SortKey = "newest" | "rating";

// The ungrouped half of the notes page: every community guide in one ranked
// list rather than filed under a character row, each tagged with the character
// it's about and filterable by those tags. The tag is the echo group's label
// (Samus / Dark Samus), so it lines up with the grouping used on the "My
// Notes" tab, the leaderboard, and Stats > Characters.
export function GuidesExplorer({
  guides,
  notedCharacters,
  userId,
  maxLength,
  createGuideAction,
  editGuideAction,
  deleteGuideAction,
  voteOnGuideAction,
  flagGuideAction,
  importGuideAction,
  initialCharacter = null,
  lang,
}: {
  guides: Guide[];
  /** Echo groups the viewer already has a private note for — drives the
   *  overwrite confirmation when importing a guide into one. */
  notedCharacters: string[];
  userId: string | null;
  maxLength: number;
  createGuideAction: (prevState: GuideFormState, formData: FormData) => Promise<GuideFormState>;
  editGuideAction: (guideId: string, prevState: GuideFormState, formData: FormData) => Promise<GuideFormState>;
  deleteGuideAction: (guideId: string) => Promise<GuideActionState>;
  voteOnGuideAction: (guideId: string, value: 1 | -1) => Promise<GuideActionState>;
  flagGuideAction: (guideId: string) => Promise<GuideActionState>;
  importGuideAction: (guideId: string) => Promise<GuideActionState>;
  /** Character to pre-filter to, from the ?character= param — set by the
   *  "Show more guides" link on a My Notes row. Already validated/canonical
   *  by the page; null means "no filter". */
  initialCharacter?: string | null;
  lang: Lang;
}) {
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(initialCharacter);
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState(false);
  const notedSet = useMemo(() => new Set(notedCharacters), [notedCharacters]);

  // Only characters that actually have a guide behind them, kept in roster
  // order so the options don't reshuffle as guides are added.
  const tags = useMemo(() => {
    const present = new Set(guides.map((g) => echoGroupCanonical(g.character as SmashCharacter)));
    return MATCHUP_CHARACTERS.filter((c) => present.has(c));
  }, [guides]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = guides.filter((guide) => {
      if (activeTag && echoGroupCanonical(guide.character as SmashCharacter) !== activeTag) return false;
      if (!q) return true;
      return guide.content.toLowerCase().includes(q) || guide.author.username.toLowerCase().includes(q);
    });
    // Sorting is client-side like the search/tag filters above, so toggling it
    // reorders instantly without a round trip. Rating breaks ties by newest,
    // matching the server's initial (score desc, createdAt desc) order.
    return visible.sort((a, b) => {
      if (sort === "rating") {
        const byScore = b.score - a.score;
        if (byScore !== 0) return byScore;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [guides, activeTag, search, sort]);

  // Paginate after filtering rather than in the query, since search/tag/sort
  // are client-side. `currentPage` is derived (clamped) so a filter that shrinks
  // the list can't strand the viewer on an out-of-range page.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const [createState, createFormAction, createPending] = useActionState(createGuideAction, { error: null });
  const submittedRef = useRef(false);

  // Same "only close on actual success" reasoning as the in-row composer —
  // closing on submit would hide a validation error along with the form.
  useEffect(() => {
    if (submittedRef.current && createState.error === null) {
      submittedRef.current = false;
      setWriting(false);
    }
  }, [createState]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder={tr(lang, { en: "Search guides…", es: "Buscar guías…", ja: "攻略を検索…" })}
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {tags.length > 0 && (
            <label className="flex w-full flex-col gap-1 text-sm sm:w-56">
              {tr(lang, { en: "Character", es: "Personaje", ja: "キャラクター" })}
              <CharacterSelect
                value={activeTag ?? ""}
                onChange={(value) => {
                  setActiveTag(value || null);
                  setPage(1);
                }}
                characters={tags}
                placeholder={tr(lang, { en: "All characters", es: "Todos los personajes", ja: "すべてのキャラ" })}
                clearLabel={tr(lang, { en: "All Characters", es: "Todos los personajes", ja: "すべてのキャラクター" })}
                className="w-full"
                lang={lang}
              />
            </label>
          )}
          <label className="flex w-full flex-col gap-1 text-sm sm:w-56">
            {tr(lang, { en: "Sort by", es: "Ordenar por", ja: "並び替え" })}
            <OptionSelect
              name="guide-sort"
              defaultValue="newest"
              options={[
                { value: "newest", label: tr(lang, { en: "Newest", es: "Más recientes", ja: "新しい順" }) },
                { value: "rating", label: tr(lang, { en: "Top rated", es: "Mejor valoradas", ja: "評価の高い順" }) },
              ]}
              onChange={(value) => {
                setSort(value as SortKey);
                setPage(1);
              }}
            />
          </label>
        </div>
      </div>

      {guides.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tr(lang, {
            en: "No one's written a guide yet — be the first.",
            es: "Nadie ha escrito una guía todavía. Sé el primero.",
            ja: "まだ攻略がありません。最初の1本を書いてみませんか。",
          })}
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tr(lang, {
            en: "No guides match those filters.",
            es: "Ninguna guía coincide con esos filtros.",
            ja: "条件に合う攻略がありません。",
          })}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {paged.map((guide) => (
              <GuideCard
                key={guide.id}
                guide={guide}
                userId={userId}
                hasOwnNote={notedSet.has(echoGroupCanonical(guide.character as SmashCharacter))}
                maxLength={maxLength}
                collapsible
                editAction={editGuideAction}
                deleteGuide={deleteGuideAction}
                voteOnGuide={voteOnGuideAction}
                flagGuideAction={flagGuideAction}
                importGuide={importGuideAction}
                tagLabel={echoGroupLabel(guide.character as SmashCharacter, lang)}
                tagIconName={echoGroupCanonical(guide.character as SmashCharacter)}
                lang={lang}
              />
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-xs text-muted-foreground">
              {tr(lang, {
                en: `${filtered.length} guide${filtered.length === 1 ? "" : "s"}`,
                es: `${filtered.length} ${filtered.length === 1 ? "guía" : "guías"}`,
                ja: `攻略${filtered.length}件`,
              })}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  {tr(lang, { en: "← Previous", es: "← Anterior", ja: "← 前へ" })}
                </Button>
                <span className="text-muted-foreground tabular-nums">
                  {tr(lang, {
                    en: `Page ${currentPage} of ${totalPages}`,
                    es: `Página ${currentPage} de ${totalPages}`,
                    ja: `${totalPages}ページ中${currentPage}ページ目`,
                  })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  {tr(lang, { en: "Next →", es: "Siguiente →", ja: "次へ →" })}
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {userId &&
        (writing ? (
          <form action={createFormAction} className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
            <CharacterSelect
              name="character"
              characters={MATCHUP_CHARACTERS}
              placeholder={tr(lang, { en: "Select a character", es: "Elige un personaje", ja: "キャラクターを選択" })}
              className="w-full sm:w-56"
              lang={lang}
            />
            <ExpandableTextarea
              name="content"
              maxLength={maxLength}
              rows={8}
              placeholder={tr(lang, {
                en: "Matchups, stage tips, anything useful for others…",
                es: "Matchups, consejos de escenario, lo que sea útil para otros…",
                ja: "対面のコツ、ステージ相性など、ほかの人に役立つことを…",
              })}
              className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 pr-8 text-sm text-foreground outline-none focus-visible:border-ring"
              title={tr(lang, { en: "Community guide", es: "Guía de la comunidad", ja: "コミュニティ攻略" })}
            />
            <div className="flex items-center justify-between gap-2">
              {createState.error ? <p className="text-xs text-destructive">{createState.error}</p> : <span />}
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setWriting(false)}>
                  {tr(lang, { en: "Cancel", es: "Cancelar", ja: "キャンセル" })}
                </Button>
                <Button type="submit" size="sm" disabled={createPending} onClick={() => (submittedRef.current = true)}>
                  {tr(lang, { en: "Post", es: "Publicar", ja: "投稿する" })}
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setWriting(true)}>
            {tr(lang, { en: "Write a guide", es: "Escribir una guía", ja: "攻略を書く" })}
          </Button>
        ))}
    </div>
  );
}
