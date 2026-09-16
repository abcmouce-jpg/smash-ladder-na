import { prisma } from "@/lib/db";
import {
  echoGroupCanonical,
  echoGroupMembers,
  isMatchupCharacter,
  MATCHUP_CHARACTERS,
  SMASH_CHARACTERS,
  type SmashCharacter,
} from "@/lib/characters";

export const MAX_MATCHUP_NOTE_LENGTH = 10000;

function groupMembers(character: string): readonly SmashCharacter[] {
  return echoGroupMembers(character as SmashCharacter);
}

// Joins whatever the given members have on file, in roster order, so a note
// written separately against both halves of an echo pair (Samus and Dark
// Samus, say) still shows up whole now that the group is one entry.
function joinNotes(members: readonly SmashCharacter[], noteByCharacter: Map<string, string>): string {
  return members
    .map((member) => noteByCharacter.get(member))
    .filter((note): note is string => Boolean(note))
    .join("\n\n");
}

// Notes are stored per roster character, but the notes page treats an echo
// group as a single entry (Samus/Dark Samus share a note, Peach/Daisy share
// one) — the same grouping the leaderboard and Stats > Characters use. Accounts
// that wrote notes for both halves of a pair before the two were merged still
// see both, joined, until their next save consolidates them (see
// upsertMatchupNote). "Random" gets no entry at all — see MATCHUP_CHARACTERS.
export async function getMatchupNotes(userId: string) {
  const notes = await prisma.matchupNote.findMany({ where: { userId } });
  const noteByCharacter = new Map(notes.map((n) => [n.character, n.note]));
  return MATCHUP_CHARACTERS.map((character) => ({
    character,
    note: joinNotes(groupMembers(character), noteByCharacter),
  }));
}

// The echo groups the user has actually written a note for (empty notes never
// get stored). The ungrouped Guides tab needs this to keep the
// confirm-before-overwrite prompt on "Import to my note", which otherwise
// only knows about notes for the characters it's currently rendering.
export async function getNotedCharacters(userId: string): Promise<string[]> {
  const notes = await prisma.matchupNote.findMany({ where: { userId }, select: { character: true } });
  const groups = notes.map((n) => echoGroupCanonical(n.character as SmashCharacter));
  return Array.from(new Set(groups.filter(isMatchupCharacter)));
}

// The note for the opponent's character, widened to its whole echo group —
// the lobby pops this up mid-match, and Samus/Dark Samus (etc.) are the same
// fighter for matchup purposes, so a note written against either should
// surface for both.
export async function getMatchupNote(userId: string, character: string) {
  const members = groupMembers(character);
  const notes = await prisma.matchupNote.findMany({
    where: { userId, character: { in: [...members] } },
    select: { character: true, note: true },
  });
  if (notes.length === 0) return null;
  const noteByCharacter = new Map(notes.map((n) => [n.character, n.note]));
  return joinNotes(members, noteByCharacter) || null;
}

// Private, one note per echo group (overwrite) — see the MatchupNote model
// comment. Writes against the group's canonical character, so the read path
// never has to re-join a stale per-echo duplicate. An empty/whitespace-only
// note deletes the whole group's rows instead of storing a blank one, so
// getMatchupNote's "does this character have a note" check (used to decide
// whether to pop the note up during a match) stays accurate.
export async function upsertMatchupNote(userId: string, character: string, note: string) {
  if (!(SMASH_CHARACTERS as readonly string[]).includes(character)) throw new Error("Not a valid character");
  const members = groupMembers(character);
  const canonical = members[0];
  const trimmed = note.trim();
  if (trimmed.length > MAX_MATCHUP_NOTE_LENGTH) {
    throw new Error(`Note is too long (max ${MAX_MATCHUP_NOTE_LENGTH} characters)`);
  }

  if (!trimmed) {
    await prisma.matchupNote.deleteMany({ where: { userId, character: { in: [...members] } } });
    return;
  }

  await prisma.$transaction([
    // Consolidates a pre-merge pair (notes on both Samus and Dark Samus) onto
    // the canonical row — the read path already joined them into one field, so
    // keeping the old row would double the text on the next load.
    prisma.matchupNote.deleteMany({
      where: { userId, character: { in: members.filter((member) => member !== canonical) } },
    }),
    prisma.matchupNote.upsert({
      where: { userId_character: { userId, character: canonical } },
      create: { userId, character: canonical, note: trimmed },
      update: { note: trimmed },
    }),
  ]);
}
