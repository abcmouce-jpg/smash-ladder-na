import type { Metadata } from "next";
import { NotebookPen } from "lucide-react";
import { auth } from "@/auth";
import { getMatchupNotes, MAX_MATCHUP_NOTE_LENGTH } from "@/lib/matchup-notes";
import { getAllCharacterGuides, MAX_GUIDE_LENGTH } from "@/lib/character-guides";
import { getLang } from "@/lib/i18n";
import { MatchupNotesList } from "@/components/matchup-notes-list";
import {
  createGuideAction,
  deleteGuideAction,
  editGuideAction,
  flagGuideAction,
  importGuideAction,
  updateMatchupNoteAction,
  voteOnGuideAction,
} from "./actions";

export const metadata: Metadata = {
  alternates: { languages: { "es-MX": "/es" } },
};

export default async function NotesPage() {
  const [session, lang] = await Promise.all([auth(), getLang()]);
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <PageTitle lang={lang} />
        <p className="mt-2 text-sm text-muted-foreground">
          {lang === "es"
            ? "Inicia sesión con Discord (arriba a la derecha) para ver tus notas."
            : "Sign in with Discord (top right) to view your notes."}
        </p>
      </main>
    );
  }

  const [notes, guidesByCharacterMap] = await Promise.all([
    getMatchupNotes(userId),
    getAllCharacterGuides(userId),
  ]);
  const guidesByCharacter = Object.fromEntries(
    Array.from(guidesByCharacterMap, ([character, guides]) => [
      character,
      guides.map((g) => ({ ...g, myVote: g.votes[0]?.value ?? 0 })),
    ]),
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <PageTitle lang={lang} />
      <p className="mt-1 text-sm text-muted-foreground">
        {lang === "es"
          ? "Solo tú puedes ver tus notas privadas. Se muestran automáticamente en tus partidas una vez que el personaje de tu rival está confirmado. Las guías de la comunidad son públicas — cualquiera puede escribir una."
          : "Only you can see your private notes. They pop up automatically in your matches once your opponent's character is locked in. Community guides are public — anyone can write one."}
      </p>
      <MatchupNotesList
        notes={notes}
        action={updateMatchupNoteAction}
        maxLength={MAX_MATCHUP_NOTE_LENGTH}
        guidesByCharacter={guidesByCharacter}
        guideMaxLength={MAX_GUIDE_LENGTH}
        userId={userId}
        createGuideAction={createGuideAction}
        editGuideAction={editGuideAction}
        deleteGuideAction={deleteGuideAction}
        voteOnGuideAction={voteOnGuideAction}
        flagGuideAction={flagGuideAction}
        importGuideAction={importGuideAction}
        lang={lang}
      />
    </main>
  );
}

function PageTitle({ lang }: { lang: "en" | "es" }) {
  return (
    <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
      <NotebookPen className="size-6 text-primary" />
      {lang === "es" ? "Notas de matchup" : "Matchup notes"}
    </h1>
  );
}
