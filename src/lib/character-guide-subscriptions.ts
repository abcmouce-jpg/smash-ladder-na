import { prisma } from "@/lib/db";
import { echoGroupCanonical, echoGroupMembers, type SmashCharacter } from "@/lib/characters";

// Subscriptions follow the same echo grouping as the row the bell sits on in
// the notes list: Samus/Dark Samus share one row, so one bell has to mean both.
// Rows written before that grouping existed (per echo member) are normalized
// through echoGroupCanonical on read, so they still light the bell up.
export async function getSubscribedCharacters(userId: string): Promise<string[]> {
  const rows = await prisma.characterGuideSubscription.findMany({
    where: { userId },
    select: { character: true },
  });
  return Array.from(new Set(rows.map((r) => echoGroupCanonical(r.character as SmashCharacter))));
}

// Toggle rather than separate subscribe/unsubscribe — the bell only ever
// needs "flip whatever it currently is", same shape as voteOnGuide's
// toggle-off-on-repeat idea. Operates on the whole echo group, so a legacy
// row on either member is both detected and swept up by one toggle.
export async function toggleCharacterGuideSubscription(userId: string, character: string): Promise<boolean> {
  const members = echoGroupMembers(character as SmashCharacter);
  const existing = await prisma.characterGuideSubscription.findMany({
    where: { userId, character: { in: [...members] } },
    select: { id: true },
  });
  if (existing.length > 0) {
    await prisma.characterGuideSubscription.deleteMany({ where: { userId, character: { in: [...members] } } });
    return false;
  }
  await prisma.characterGuideSubscription.create({ data: { userId, character: members[0] } });
  return true;
}
