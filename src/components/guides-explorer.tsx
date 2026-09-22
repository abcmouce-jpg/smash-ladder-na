"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CharacterSelect } from "@/components/character-select";
import { ExpandableTextarea } from "@/components/expandable-textarea";
import { GuideCard, type Guide } from "@/components/character-guide-section";
import { echoGroupCanonical, echoGroupLabel, MATCHUP_CHARACTERS, type SmashCharacter } from "@/lib/characters";
import type { Lang } from "@/lib/i18n";
import type { GuideActionState, GuideFormState } from "@/app/notes/actions";

// Guides per page on the ungrouped tab. Guides can run long, so this is set
// well below the leaderboard's 50 to keep a page scannable.
const PAGE_SIZE = 10;

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
    return guides.filter((guide) => {
      if (activeTag && echoGroupCanonical(guide.character as SmashCharacter) !== activeTag) return false;
      if (!q) return true;
      return guide.content.toLowerCase().includes(q) || guide.author.username.toLowerCase().includes(q);
    });
  }, [guides, activeTag, search]);

  // Paginate after filtering rather than in the query, since search/tag are
  // client-side. `currentPage` is derived (clamped) so a filter that shrinks
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
          placeholder={lang === "es" ? "Buscar guías…" : "Search guides…"}
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring"
        />
        {tags.length > 0 && (
          <label className="flex w-full flex-col gap-1 text-sm sm:w-56">
            {lang === "es" ? "Personaje" : "Character"}
            <CharacterSelect
              value={activeTag ?? ""}
              onChange={(value) => {
                setActiveTag(value || null);
                setPage(1);
              }}
              characters={tags}
              placeholder={lang === "es" ? "Todos los personajes" : "All characters"}
              clearLabel={lang === "es" ? "Todos los personajes" : "All Characters"}
              className="w-full"
            />
          </label>
        )}
      </div>

      {guides.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {lang === "es"
            ? "Nadie ha escrito una guía todavía. Sé el primero."
            : "No one's written a guide yet — be the first."}
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {lang === "es" ? "Ninguna guía coincide con esos filtros." : "No guides match those filters."}
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
                tagLabel={echoGroupLabel(guide.character as SmashCharacter)}
                tagIconName={echoGroupCanonical(guide.character as SmashCharacter)}
                lang={lang}
              />
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-xs text-muted-foreground">
              {lang === "es"
                ? `${filtered.length} ${filtered.length === 1 ? "guía" : "guías"}`
                : `${filtered.length} guide${filtered.length === 1 ? "" : "s"}`}
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
                  {lang === "es" ? "← Anterior" : "← Previous"}
                </Button>
                <span className="text-muted-foreground tabular-nums">
                  {lang === "es" ? `Página ${currentPage} de ${totalPages}` : `Page ${currentPage} of ${totalPages}`}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  {lang === "es" ? "Siguiente →" : "Next →"}
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
              placeholder={lang === "es" ? "Elige un personaje" : "Select a character"}
              className="w-full sm:w-56"
            />
            <ExpandableTextarea
              name="content"
              maxLength={maxLength}
              rows={8}
              placeholder={
                lang === "es"
                  ? "Matchups, consejos de escenario, lo que sea útil para otros…"
                  : "Matchups, stage tips, anything useful for others…"
              }
              className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 pr-8 text-sm text-foreground outline-none focus-visible:border-ring"
              title={lang === "es" ? "Guía de la comunidad" : "Community guide"}
            />
            <div className="flex items-center justify-between gap-2">
              {createState.error ? <p className="text-xs text-destructive">{createState.error}</p> : <span />}
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setWriting(false)}>
                  {lang === "es" ? "Cancelar" : "Cancel"}
                </Button>
                <Button type="submit" size="sm" disabled={createPending} onClick={() => (submittedRef.current = true)}>
                  {lang === "es" ? "Publicar" : "Post"}
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setWriting(true)}>
            {lang === "es" ? "Escribir una guía" : "Write a guide"}
          </Button>
        ))}
    </div>
  );
}
