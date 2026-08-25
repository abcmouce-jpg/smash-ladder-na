import { prisma } from "@/lib/db";
import { SMASH_CHARACTERS } from "@/lib/characters";

export const MAX_MATCHUP_NOTE_LENGTH = 2000;

export async function getMatchupNotes(userId: string) {
  const notes = await prisma.matchupNote.findMany({ where: { userId } });
  const byCharacter = new Map(notes.map((n) => [n.character, n.note]));
  return SMASH_CHARACTERS.map((character) => ({ character, note: byCharacter.get(character) ?? "" }));
}

export async function getMatchupNote(userId: string, character: string) {
  const note = await prisma.matchupNote.findUnique({ where: { userId_character: { userId, character } } });
  return note?.note ?? null;
}

// Private, one note per character (overwrite) — see the MatchupNote model
// comment. An empty/whitespace-only note deletes the row instead of storing
// a blank one, so getMatchupNote's "does this character have a note" check
// (used to decide whether to pop the note up during a match) stays accurate.
export async function upsertMatchupNote(userId: string, character: string, note: string) {
  if (!(SMASH_CHARACTERS as readonly string[]).includes(character)) throw new Error("Not a valid character");
  const trimmed = note.trim();
  if (trimmed.length > MAX_MATCHUP_NOTE_LENGTH) {
    throw new Error(`Note is too long (max ${MAX_MATCHUP_NOTE_LENGTH} characters)`);
  }

  if (!trimmed) {
    await prisma.matchupNote.deleteMany({ where: { userId, character } });
    return;
  }

  await prisma.matchupNote.upsert({
    where: { userId_character: { userId, character } },
    create: { userId, character, note: trimmed },
    update: { note: trimmed },
  });
}
