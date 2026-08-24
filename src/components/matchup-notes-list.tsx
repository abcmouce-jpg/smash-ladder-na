"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CharacterIcon } from "@/components/character-icon";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CharacterGuideSection, type Guide } from "@/components/character-guide-section";
import type { Lang } from "@/lib/i18n";
import type { GuideFormState, UpdateMatchupNoteState } from "@/app/notes/actions";

type Note = { character: string; note: string };

export function MatchupNotesList({
  notes,
  action,
  maxLength,
  guidesByCharacter,
  guideMaxLength,
  userId,
  createGuideAction,
  editGuideAction,
  deleteGuideAction,
  voteOnGuideAction,
  flagGuideAction,
  importGuideAction,
  lang,
}: {
  notes: Note[];
  action: (character: string, prevState: UpdateMatchupNoteState, formData: FormData) => Promise<UpdateMatchupNoteState>;
  // Passed down rather than imported directly — matchup-notes.ts pulls in
  // prisma, and importing anything from it here (even a constant) would
  // drag that into the client bundle. Same reasoning as MAX_QUICK_MESSAGE_LENGTH's
  // comment in quick-messages.ts, which sidesteps it by staying prisma-free
  // instead; this file can't do that since it also holds the DB functions.
  maxLength: number;
  guidesByCharacter: Record<string, Guide[]>;
  guideMaxLength: number;
  userId: string | null;
  createGuideAction: (character: string, prevState: GuideFormState, formData: FormData) => Promise<GuideFormState>;
  editGuideAction: (guideId: string, prevState: GuideFormState, formData: FormData) => Promise<GuideFormState>;
  deleteGuideAction: (guideId: string) => Promise<void>;
  voteOnGuideAction: (guideId: string, value: 1 | -1) => Promise<void>;
  flagGuideAction: (guideId: string) => Promise<void>;
  importGuideAction: (guideId: string) => Promise<void>;
  lang: Lang;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.character.toLowerCase().includes(q));
  }, [notes, search]);

  // Characters with an existing note surface first, so the page opens on
  // "what have I already written" rather than an alphabetical wall of
  // ~90 empty entries.
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => (a.note ? 0 : 1) - (b.note ? 0 : 1)),
    [filtered],
  );

  return (
    <div className="mt-6">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={lang === "es" ? "Buscar personaje…" : "Search character…"}
        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring"
      />
      <ul className="mt-3 flex flex-col gap-2">
        {sorted.map(({ character, note }) => (
          <MatchupNoteRow
            key={character}
            character={character}
            note={note}
            expanded={expanded === character}
            onToggle={() => setExpanded(expanded === character ? null : character)}
            action={action}
            maxLength={maxLength}
            guides={guidesByCharacter[character] ?? []}
            guideMaxLength={guideMaxLength}
            userId={userId}
            createGuideAction={createGuideAction}
            editGuideAction={editGuideAction}
            deleteGuideAction={deleteGuideAction}
            voteOnGuideAction={voteOnGuideAction}
            flagGuideAction={flagGuideAction}
            importGuideAction={importGuideAction}
            lang={lang}
          />
        ))}
        {sorted.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            {lang === "es" ? "Ningún personaje coincide con esa búsqueda." : "No characters match that search."}
          </p>
        )}
      </ul>
    </div>
  );
}

function MatchupNoteRow({
  character,
  note,
  expanded,
  onToggle,
  action,
  maxLength,
  guides,
  guideMaxLength,
  userId,
  createGuideAction,
  editGuideAction,
  deleteGuideAction,
  voteOnGuideAction,
  flagGuideAction,
  importGuideAction,
  lang,
}: {
  character: string;
  note: string;
  expanded: boolean;
  onToggle: () => void;
  action: (character: string, prevState: UpdateMatchupNoteState, formData: FormData) => Promise<UpdateMatchupNoteState>;
  maxLength: number;
  guides: Guide[];
  guideMaxLength: number;
  userId: string | null;
  createGuideAction: (character: string, prevState: GuideFormState, formData: FormData) => Promise<GuideFormState>;
  editGuideAction: (guideId: string, prevState: GuideFormState, formData: FormData) => Promise<GuideFormState>;
  deleteGuideAction: (guideId: string) => Promise<void>;
  voteOnGuideAction: (guideId: string, value: 1 | -1) => Promise<void>;
  flagGuideAction: (guideId: string) => Promise<void>;
  importGuideAction: (guideId: string) => Promise<void>;
  lang: Lang;
}) {
  const boundAction = action.bind(null, character);
  const [state, formAction, isPending] = useActionState(boundAction, { error: null });

  return (
    <Card className="py-0">
      <CardContent className="py-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center gap-3 text-left"
        >
          <CharacterIcon name={character} size={28} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{character}</p>
            {!expanded && note && <p className="truncate text-xs text-muted-foreground">{note}</p>}
          </div>
          {expanded ? (
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        {expanded && (
          <form action={formAction} className="mt-2.5 flex flex-col gap-1.5">
            <textarea
              name="note"
              defaultValue={note}
              maxLength={maxLength}
              rows={3}
              placeholder={lang === "es" ? "Tu nota privada para este personaje…" : "Your private note for this character…"}
              className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus-visible:border-ring"
            />
            <div className="flex items-center justify-between">
              {state.error ? (
                <p className="text-xs text-destructive">{state.error}</p>
              ) : (
                <span />
              )}
              <Button type="submit" size="sm" disabled={isPending}>
                {lang === "es" ? "Guardar" : "Save"}
              </Button>
            </div>
          </form>
        )}
        {expanded && (
          <CharacterGuideSection
            character={character}
            guides={guides}
            userId={userId}
            hasOwnNote={!!note}
            maxLength={guideMaxLength}
            createAction={createGuideAction}
            editAction={editGuideAction}
            deleteGuide={deleteGuideAction}
            voteOnGuide={voteOnGuideAction}
            flagGuideAction={flagGuideAction}
            importGuide={importGuideAction}
            lang={lang}
          />
        )}
      </CardContent>
    </Card>
  );
}
