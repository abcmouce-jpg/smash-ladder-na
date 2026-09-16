"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CharacterIcon } from "@/components/character-icon";
import { CharacterSelect } from "@/components/character-select";
import { ExpandableTextarea } from "@/components/expandable-textarea";
import { GuideCard, type Guide } from "@/components/character-guide-section";
import { echoGroupCanonical, echoGroupLabel, MATCHUP_CHARACTERS, type SmashCharacter } from "@/lib/characters";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n";
import type { GuideActionState, GuideFormState } from "@/app/notes/actions";

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
  lang: Lang;
}) {
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const notedSet = useMemo(() => new Set(notedCharacters), [notedCharacters]);

  // Only tags that actually have a guide behind them, kept in roster order so
  // the chips don't reshuffle as guides are added.
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
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lang === "es" ? "Buscar guías…" : "Search guides…"}
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring"
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <TagChip
              label={lang === "es" ? "Todos" : "All"}
              active={activeTag === null}
              onClick={() => setActiveTag(null)}
            />
            {tags.map((tag) => (
              <TagChip
                key={tag}
                label={echoGroupLabel(tag)}
                iconName={tag}
                active={activeTag === tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              />
            ))}
          </div>
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
        <ul className="flex flex-col gap-2">
          {filtered.map((guide) => (
            <GuideCard
              key={guide.id}
              guide={guide}
              userId={userId}
              hasOwnNote={notedSet.has(echoGroupCanonical(guide.character as SmashCharacter))}
              maxLength={maxLength}
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

function TagChip({
  label,
  iconName,
  active,
  onClick,
}: {
  label: string;
  iconName?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary/40 bg-primary/10 font-medium text-primary"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {iconName && <CharacterIcon name={iconName} size={14} />}
      {label}
    </button>
  );
}
