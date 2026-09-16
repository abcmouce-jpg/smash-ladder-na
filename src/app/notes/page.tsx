import type { Metadata } from "next";
import { NotebookPen } from "lucide-react";
import { auth } from "@/auth";
import { getMatchupNotes, getNotedCharacters, MAX_MATCHUP_NOTE_LENGTH } from "@/lib/matchup-notes";
import { getAllCharacterGuides, getAllGuides, MAX_GUIDE_LENGTH } from "@/lib/character-guides";
import { getSubscribedCharacters } from "@/lib/character-guide-subscriptions";
import { getLang, type Lang } from "@/lib/i18n";
import { SectionTabs } from "@/components/section-tabs";
import { MatchupNotesList } from "@/components/matchup-notes-list";
import { GuidesExplorer } from "@/components/guides-explorer";
import {
  createGuideAction,
  deleteGuideAction,
  editGuideAction,
  flagGuideAction,
  importGuideAction,
  toggleCharacterGuideSubscriptionAction,
  updateMatchupNoteAction,
  voteOnGuideAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Notes — Smash Ladder NA",
  description: "Your private matchup notes and every public community character guide.",
  alternates: { languages: { "es-MX": "/es" } },
};

// Two views under one "Notes" roof (formerly a single character-grouped page
// reachable only from the profile dropdown): the private notes + guides filed
// under each character, and every guide as a flat, tag-filterable list. The
// ?tab= param drives which renders, so each stays deep-linkable and
// server-rendered — same pattern as the Stats page.
const VALID_TABS = ["matchups", "guides"] as const;
type NotesTab = (typeof VALID_TABS)[number];

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab: tabParam }, session, lang] = await Promise.all([searchParams, auth(), getLang()]);
  const userId = session?.user?.id ?? null;
  const tab: NotesTab = VALID_TABS.includes((tabParam ?? "") as NotesTab) ? (tabParam as NotesTab) : "matchups";

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <PageTitle lang={lang} />
      <SectionTabs
        className="mt-6"
        items={[
          {
            href: "?tab=matchups",
            label: lang === "es" ? "Mis notas" : "My Notes",
            active: tab === "matchups",
          },
          { href: "?tab=guides", label: lang === "es" ? "Guías" : "Guides", active: tab === "guides" },
        ]}
      />
      <div className="mt-6">
        {tab === "matchups" ? <MatchupsTab userId={userId} lang={lang} /> : <GuidesTab userId={userId} lang={lang} />}
      </div>
    </main>
  );
}

async function MatchupsTab({ userId, lang }: { userId: string | null; lang: Lang }) {
  if (!userId) {
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "es"
          ? "Inicia sesión con Discord (arriba a la derecha) para ver tus notas."
          : "Sign in with Discord (top right) to view your notes."}
      </p>
    );
  }

  const [notes, guidesByCharacter, subscribedCharacters] = await Promise.all([
    getMatchupNotes(userId),
    getAllCharacterGuides(userId),
    getSubscribedCharacters(userId),
  ]);

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {lang === "es"
          ? "Solo tú puedes ver tus notas privadas. Se muestran automáticamente en tus partidas una vez que el personaje de tu rival está confirmado. Las guías de la comunidad son públicas — cualquiera puede escribir una. Los personajes echo comparten entrada con su personaje base."
          : "Only you can see your private notes. They pop up automatically in your matches once your opponent's character is locked in. Community guides are public — anyone can write one. Echo fighters share an entry with their base fighter."}
      </p>
      <MatchupNotesList
        notes={notes}
        action={updateMatchupNoteAction}
        maxLength={MAX_MATCHUP_NOTE_LENGTH}
        guidesByCharacter={Object.fromEntries(guidesByCharacter)}
        guideMaxLength={MAX_GUIDE_LENGTH}
        userId={userId}
        createGuideAction={createGuideAction}
        editGuideAction={editGuideAction}
        deleteGuideAction={deleteGuideAction}
        voteOnGuideAction={voteOnGuideAction}
        flagGuideAction={flagGuideAction}
        importGuideAction={importGuideAction}
        subscribedCharacters={subscribedCharacters}
        toggleSubscriptionAction={toggleCharacterGuideSubscriptionAction}
        lang={lang}
      />
    </>
  );
}

async function GuidesTab({ userId, lang }: { userId: string | null; lang: Lang }) {
  const [guides, notedCharacters] = await Promise.all([
    getAllGuides(userId),
    userId ? getNotedCharacters(userId) : Promise.resolve([]),
  ]);

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {lang === "es"
          ? "Todas las guías de la comunidad en una sola lista, etiquetadas por personaje. Filtra por etiqueta o busca para encontrar consejos de matchup. Los personajes echo comparten etiqueta con su personaje base."
          : "Every community guide in one list, tagged by character. Filter by tag or search to find matchup advice. Echo fighters share a tag with their base fighter."}
      </p>
      <div className="mt-4">
        <GuidesExplorer
          guides={guides}
          notedCharacters={notedCharacters}
          userId={userId}
          maxLength={MAX_GUIDE_LENGTH}
          createGuideAction={createGuideAction}
          editGuideAction={editGuideAction}
          deleteGuideAction={deleteGuideAction}
          voteOnGuideAction={voteOnGuideAction}
          flagGuideAction={flagGuideAction}
          importGuideAction={importGuideAction}
          lang={lang}
        />
      </div>
    </>
  );
}

function PageTitle({ lang }: { lang: Lang }) {
  return (
    <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
      <NotebookPen className="size-6 text-primary" />
      {lang === "es" ? "Notas" : "Notes"}
    </h1>
  );
}
