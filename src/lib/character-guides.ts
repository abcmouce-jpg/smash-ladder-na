import { prisma } from "@/lib/db";
import { SMASH_CHARACTERS } from "@/lib/characters";

export const MAX_GUIDE_LENGTH = 10000;

// Once a guide collects this many distinct flags it's auto-hidden pending a
// mod's review — same shape as ConductReport's mod queue, just triggered by
// a threshold instead of every single report. Small on purpose: a handful of
// flags on a small community is already a strong signal, and hiding is not
// deleting — a mod can always unhide.
export const FLAG_HIDE_THRESHOLD = 3;

function assertValidCharacter(character: string) {
  if (!(SMASH_CHARACTERS as readonly string[]).includes(character)) throw new Error("Not a valid character");
}

// Visible (non-hidden) guides for every character in one query, grouped by
// character — the /notes page renders all ~90 characters at once, and one
// query grouped in JS beats 90 round trips. Guide volume (community-authored,
// not one-per-user) stays small enough that loading everything up front is
// cheap.
export async function getAllCharacterGuides(viewerId: string | null) {
  const guides = await prisma.characterGuide.findMany({
    where: { hiddenAt: null },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    include: {
      author: { select: { id: true, username: true, avatarUrl: true } },
      // Filtered by an always-empty userId when signed out, rather than
      // toggling `include.votes` between an object and `false` — keeps the
      // result shape (and its inferred type) identical in both cases instead
      // of a conditional union that's awkward to consume below.
      votes: { where: { userId: viewerId ?? "" }, select: { value: true } },
      flags: { where: { userId: viewerId ?? "" }, select: { id: true } },
    },
  });

  const byCharacter = new Map<string, (typeof guides)[number][]>();
  for (const g of guides) {
    const list = byCharacter.get(g.character);
    if (list) list.push(g);
    else byCharacter.set(g.character, [g]);
  }
  return byCharacter;
}

export async function createCharacterGuide(authorId: string, character: string, content: string) {
  assertValidCharacter(character);
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Guide can't be empty");
  if (trimmed.length > MAX_GUIDE_LENGTH) throw new Error(`Guide is too long (max ${MAX_GUIDE_LENGTH} characters)`);

  return prisma.characterGuide.create({ data: { character, authorId, content: trimmed } });
}

export async function updateCharacterGuide(authorId: string, guideId: string, content: string) {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Guide can't be empty");
  if (trimmed.length > MAX_GUIDE_LENGTH) throw new Error(`Guide is too long (max ${MAX_GUIDE_LENGTH} characters)`);

  const guide = await prisma.characterGuide.findUnique({ where: { id: guideId } });
  if (!guide) throw new Error("Guide not found");
  if (guide.authorId !== authorId) throw new Error("Only the author can edit this guide");

  await prisma.characterGuide.update({ where: { id: guideId }, data: { content: trimmed } });
}

export async function deleteCharacterGuide(authorId: string, guideId: string) {
  const guide = await prisma.characterGuide.findUnique({ where: { id: guideId } });
  if (!guide) return; // already gone — no-op
  if (guide.authorId !== authorId) throw new Error("Only the author can delete this guide");

  await prisma.characterGuide.delete({ where: { id: guideId } });
}

// Upsert-style: voting again with the same value clears the vote (toggle
// off), voting the opposite value flips it. Recomputes `score` from the
// vote rows in the same transaction rather than incrementing/decrementing
// in place, so it can't drift out of sync under concurrent votes.
export async function voteOnGuide(userId: string, guideId: string, value: 1 | -1) {
  await prisma.$transaction(async (tx) => {
    const guide = await tx.characterGuide.findUnique({ where: { id: guideId }, select: { authorId: true } });
    if (!guide) throw new Error("Guide not found");
    if (guide.authorId === userId) throw new Error("You can't vote on your own guide");

    const existing = await tx.characterGuideVote.findUnique({
      where: { guideId_userId: { guideId, userId } },
    });

    if (existing?.value === value) {
      await tx.characterGuideVote.delete({ where: { id: existing.id } });
    } else if (existing) {
      await tx.characterGuideVote.update({ where: { id: existing.id }, data: { value } });
    } else {
      await tx.characterGuideVote.create({ data: { guideId, userId, value } });
    }

    const score = await tx.characterGuideVote.aggregate({ where: { guideId }, _sum: { value: true } });
    await tx.characterGuide.update({ where: { id: guideId }, data: { score: score._sum.value ?? 0 } });
  });
}

// One flag per user per guide (same idea as a vote) — auto-hides once
// flagCount crosses FLAG_HIDE_THRESHOLD. No-ops silently on a repeat flag
// from the same user rather than erroring, since the caller's UI doesn't
// need to distinguish "already flagged" from "just flagged" — either way
// the guide is (or was already) reported.
export async function flagGuide(userId: string, guideId: string) {
  await prisma.$transaction(async (tx) => {
    const guide = await tx.characterGuide.findUnique({ where: { id: guideId }, select: { authorId: true } });
    if (!guide) throw new Error("Guide not found");
    if (guide.authorId === userId) throw new Error("You can't flag your own guide");

    const existing = await tx.characterGuideFlag.findUnique({
      where: { guideId_userId: { guideId, userId } },
    });
    if (existing) return;

    await tx.characterGuideFlag.create({ data: { guideId, userId } });
    const flagCount = await tx.characterGuideFlag.count({ where: { guideId } });
    await tx.characterGuide.update({
      where: { id: guideId },
      data: {
        flagCount,
        ...(flagCount >= FLAG_HIDE_THRESHOLD ? { hiddenAt: new Date() } : {}),
      },
    });
  });
}

export async function getHiddenGuidesForModeration() {
  return prisma.characterGuide.findMany({
    where: { hiddenAt: { not: null } },
    orderBy: { hiddenAt: "desc" },
    include: { author: { select: { id: true, username: true } } },
  });
}

// Both writes run in one transaction — if only the first committed, the
// guide would come back visible with flagCount reset to 0 while the old
// CharacterGuideFlag rows survived, and the (guideId, userId) unique
// constraint would then silently block those same users from ever
// re-flagging it (flagGuide's `if (existing) return` no-ops on their next
// report), permanently weakening moderation for that guide.
export async function unhideGuide(guideId: string) {
  await prisma.$transaction([
    prisma.characterGuide.update({ where: { id: guideId }, data: { hiddenAt: null, flagCount: 0 } }),
    prisma.characterGuideFlag.deleteMany({ where: { guideId } }),
  ]);
}

export async function removeGuide(guideId: string) {
  await prisma.characterGuide.delete({ where: { id: guideId } });
}
