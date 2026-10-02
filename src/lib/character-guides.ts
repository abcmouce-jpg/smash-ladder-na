import { after } from "next/server";
import { prisma } from "@/lib/db";
import {
  echoGroupCanonical,
  echoGroupLabel,
  echoGroupMembers,
  isMatchupCharacter,
  SMASH_CHARACTERS,
  type SmashCharacter,
} from "@/lib/characters";
import { sendDiscordDMsSequentially } from "@/lib/discord-bot";
import { isNotificationEnabled } from "@/lib/notifications";
import { siteOrigin } from "@/lib/site-url";

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

// The echo group a guide belongs to, or null for a character the notes page
// doesn't cover ("Random"). Guides are filed and tagged by this, so a guide
// written for Dark Samus shows up under Samus/Dark Samus, and a stray guide
// on "Random" stays out of the notes UI entirely.
function guideGroup(character: string): SmashCharacter | null {
  const group = echoGroupCanonical(character as SmashCharacter);
  return isMatchupCharacter(group) ? group : null;
}

// What the client guide cards actually render. The raw rows also carry the
// viewer's vote/flag relations, which is more than the UI needs to receive.
export type GuideView = {
  id: string;
  character: string;
  content: string;
  score: number;
  authorId: string;
  author: { id: string; username: string };
  myVote: number;
  myFlag: boolean;
};

// One query for every visible (non-hidden) guide, with the viewer's own vote
// and flag folded in. Callers group or flatten it as needed; guide volume
// (community-authored, not one-per-user) stays small enough that loading
// everything up front is cheap.
async function getVisibleGuides(viewerId: string | null) {
  return prisma.characterGuide.findMany({
    where: { hiddenAt: null },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    include: {
      author: { select: { id: true, username: true } },
      // Filtered by an always-empty userId when signed out, rather than
      // toggling `include.votes` between an object and `false` — keeps the
      // result shape (and its inferred type) identical in both cases instead
      // of a conditional union that's awkward to consume below.
      votes: { where: { userId: viewerId ?? "" }, select: { value: true } },
      flags: { where: { userId: viewerId ?? "" }, select: { id: true } },
    },
  });
}

type RawGuide = Awaited<ReturnType<typeof getVisibleGuides>>[number];

function toGuideView(guide: RawGuide): GuideView {
  return {
    id: guide.id,
    character: guide.character,
    content: guide.content,
    score: guide.score,
    authorId: guide.authorId,
    author: { id: guide.author.id, username: guide.author.username },
    myVote: guide.votes[0]?.value ?? 0,
    myFlag: guide.flags.length > 0,
  };
}

// Visible guides grouped by echo group — the notes page's "My Notes" tab
// renders one row per character and needs this character's (and its echo's)
// guides alongside the note now, rather than 90 separate round trips. Keyed by
// each group's canonical character so Peach and Daisy share a row, matching the
// leaderboard and Stats > Characters grouping.
export async function getAllCharacterGuides(viewerId: string | null) {
  const guides = await getVisibleGuides(viewerId);
  const byCharacter = new Map<string, GuideView[]>();
  for (const guide of guides) {
    const group = guideGroup(guide.character);
    if (!group) continue;
    const view = toGuideView(guide);
    const list = byCharacter.get(group);
    if (list) list.push(view);
    else byCharacter.set(group, [view]);
  }
  return byCharacter;
}

// The same guides as a flat, globally-ranked list for the ungrouped Guides
// tab, where each guide carries its own character tag instead of being filed
// under a character row.
export async function getAllGuides(viewerId: string | null): Promise<GuideView[]> {
  const guides = await getVisibleGuides(viewerId);
  return guides.filter((guide) => guideGroup(guide.character) !== null).map(toGuideView);
}

const GUIDE_DM = {
  en: (label: string, link: string) => `📖 New community guide for ${label} — check it out: ${link}`,
  es: (label: string, link: string) => `📖 Nueva guía de la comunidad para ${label} — mírala: ${link}`,
} as const;

// DMs everyone subscribed to a character's bell (the follow button on /notes),
// except the author. This used to be a browser push; it's Discord-only now (see
// DM_CHARACTER_GUIDE). One batch per language, sent through
// sendDiscordDMsSequentially (1s apart — see its comment), so a large subscriber
// list can't trip Discord's abuse detection. Called via deferGuideNotification so
// it never holds up the request that posted the guide.
export async function notifyCharacterGuideSubscribers(character: string, authorId: string) {
  // Matches the subscriber's whole echo group and names the group in the
  // message, so the bell on the Samus/Dark Samus row fires for a guide either
  // half of the pair gets.
  const groupMembers = echoGroupMembers(character as SmashCharacter);
  const label = echoGroupLabel(character as SmashCharacter);
  const subscribers = await prisma.user.findMany({
    where: { id: { not: authorId }, characterGuideSubscriptions: { some: { character: { in: [...groupMembers] } } } },
    select: { discordId: true, preferredLanguage: true, notificationsDisabled: true },
  });

  const link = `${siteOrigin()}/notes`;
  const en: { discordId: string }[] = [];
  const es: { discordId: string }[] = [];
  for (const subscriber of subscribers) {
    if (!isNotificationEnabled(subscriber, "DM_CHARACTER_GUIDE")) continue;
    (subscriber.preferredLanguage === "es" ? es : en).push({ discordId: subscriber.discordId });
  }
  if (en.length > 0) await sendDiscordDMsSequentially(en, GUIDE_DM.en(label, link));
  if (es.length > 0) await sendDiscordDMsSequentially(es, GUIDE_DM.es(label, link));
}

// Defers notifyCharacterGuideSubscribers to run once the creating request
// has committed — same reasoning as deferMatchmakingNotification in
// free-battle.ts: notifying a whole subscriber list shouldn't hold up the
// response to whoever just posted, and after() throws outside a real
// request scope (integration tests, one-off scripts), which is a
// deliberate no-op here rather than a bug to catch.
function deferGuideNotification(character: string, authorId: string) {
  try {
    after(() => notifyCharacterGuideSubscribers(character, authorId));
  } catch {
    // See comment above.
  }
}

export async function createCharacterGuide(authorId: string, character: string, content: string) {
  assertValidCharacter(character);
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Guide can't be empty");
  if (trimmed.length > MAX_GUIDE_LENGTH) throw new Error(`Guide is too long (max ${MAX_GUIDE_LENGTH} characters)`);

  // Filed under the echo group's canonical character so Samus/Dark Samus (and
  // the other pairs) share one tag — the read path groups by the same key.
  const group = echoGroupCanonical(character as SmashCharacter);
  const guide = await prisma.characterGuide.create({ data: { character: group, authorId, content: trimmed } });
  deferGuideNotification(group, authorId);
  return guide;
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
