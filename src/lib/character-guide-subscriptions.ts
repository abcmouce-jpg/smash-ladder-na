import { prisma } from "@/lib/db";

export async function getSubscribedCharacters(userId: string): Promise<string[]> {
  const rows = await prisma.characterGuideSubscription.findMany({
    where: { userId },
    select: { character: true },
  });
  return rows.map((r) => r.character);
}

// Toggle rather than separate subscribe/unsubscribe — the bell only ever
// needs "flip whatever it currently is", same shape as voteOnGuide's
// toggle-off-on-repeat idea.
export async function toggleCharacterGuideSubscription(userId: string, character: string): Promise<boolean> {
  const existing = await prisma.characterGuideSubscription.findUnique({
    where: { userId_character: { userId, character } },
  });
  if (existing) {
    await prisma.characterGuideSubscription.delete({ where: { id: existing.id } });
    return false;
  }
  await prisma.characterGuideSubscription.create({ data: { userId, character } });
  return true;
}
