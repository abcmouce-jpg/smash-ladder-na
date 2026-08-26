"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { Bell, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { CharacterIcon } from "@/components/character-icon";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CharacterGuideSection, type Guide } from "@/components/character-guide-section";
import { ExpandableTextarea } from "@/components/expandable-textarea";
import { getPushSubscription, subscribeToPush } from "@/lib/push-client";
import { savePushSubscriptionAction } from "@/app/settings/actions";
import type { Lang } from "@/lib/i18n";
import type {
  GuideActionState,
  GuideFormState,
  ToggleSubscriptionState,
  UpdateMatchupNoteState,
} from "@/app/notes/actions";

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
  subscribedCharacters,
  toggleSubscriptionAction,
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
  deleteGuideAction: (guideId: string) => Promise<GuideActionState>;
  voteOnGuideAction: (guideId: string, value: 1 | -1) => Promise<GuideActionState>;
  flagGuideAction: (guideId: string) => Promise<GuideActionState>;
  importGuideAction: (guideId: string) => Promise<GuideActionState>;
  subscribedCharacters: string[];
  toggleSubscriptionAction: (character: string) => Promise<ToggleSubscriptionState>;
  lang: Lang;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const subscribedSet = useMemo(() => new Set(subscribedCharacters), [subscribedCharacters]);

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
            isSubscribed={subscribedSet.has(character)}
            toggleSubscriptionAction={toggleSubscriptionAction}
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
  isSubscribed,
  toggleSubscriptionAction,
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
  deleteGuideAction: (guideId: string) => Promise<GuideActionState>;
  voteOnGuideAction: (guideId: string, value: 1 | -1) => Promise<GuideActionState>;
  flagGuideAction: (guideId: string) => Promise<GuideActionState>;
  importGuideAction: (guideId: string) => Promise<GuideActionState>;
  isSubscribed: boolean;
  toggleSubscriptionAction: (character: string) => Promise<ToggleSubscriptionState>;
  lang: Lang;
}) {
  const boundAction = action.bind(null, character);
  const [state, formAction, isPending] = useActionState(boundAction, { error: null });
  const [subscribed, setSubscribed] = useState(isSubscribed);
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  async function handleToggleSubscription() {
    setSubBusy(true);
    setSubError(null);
    try {
      if (!subscribed && !(await getPushSubscription())) {
        const result = await subscribeToPush();
        if ("error" in result) {
          setSubError(result.error);
          return;
        }
        const { endpoint, keys } = result.subscription.toJSON();
        const saved = await savePushSubscriptionAction({
          endpoint: endpoint ?? "",
          p256dh: keys?.p256dh ?? "",
          auth: keys?.auth ?? "",
        });
        if (!saved.success) throw new Error("Failed to save subscription");
      }
      const result = await toggleSubscriptionAction(character);
      if (result.error) {
        setSubError(result.error);
        return;
      }
      setSubscribed(result.subscribed);
    } catch {
      setSubError(lang === "es" ? "Algo salió mal — inténtalo de nuevo." : "Something went wrong — try again.");
    } finally {
      setSubBusy(false);
    }
  }

  return (
    <Card className="py-0">
      <CardContent className="py-2.5">
        <div className="flex w-full items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <CharacterIcon name={character} size={28} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {character}
                {guides.length > 0 && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px] tabular-nums">
                    {guides.length}
                  </Badge>
                )}
              </p>
              {!expanded && note && <p className="truncate text-xs text-muted-foreground">{note}</p>}
            </div>
          </button>
          {userId && (
            <button
              type="button"
              onClick={handleToggleSubscription}
              disabled={subBusy}
              aria-label={
                subscribed
                  ? lang === "es"
                    ? "Dejar de recibir notificaciones de nuevas guías"
                    : "Stop notifying me of new guides"
                  : lang === "es"
                    ? "Recibir notificaciones de nuevas guías"
                    : "Notify me of new guides"
              }
              title={
                subscribed
                  ? lang === "es"
                    ? "Recibirás una notificación cuando alguien publique una nueva guía"
                    : "You'll be notified when someone posts a new guide"
                  : undefined
              }
              className={
                subscribed
                  ? "shrink-0 rounded p-1 text-primary"
                  : "shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              }
            >
              {subBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Bell className="size-4" fill={subscribed ? "currentColor" : "none"} />
              )}
            </button>
          )}
          <button type="button" onClick={onToggle} className="shrink-0">
            {expanded ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </button>
        </div>
        {subError && <p className="mt-1 text-xs text-destructive">{subError}</p>}
        {expanded && (
          <form action={formAction} className="mt-2.5 flex flex-col gap-1.5">
            <ExpandableTextarea
              name="note"
              defaultValue={note}
              maxLength={maxLength}
              rows={6}
              placeholder={lang === "es" ? "Tu nota privada para este personaje…" : "Your private note for this character…"}
              className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 pr-8 text-sm text-foreground outline-none focus-visible:border-ring"
              title={character}
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
