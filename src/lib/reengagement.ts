import { prisma } from "@/lib/db";
import { MatchStatus, UserStatus } from "@/generated/prisma/enums";
import { sendDiscordDMsSequentially } from "@/lib/discord-bot";
import { isNotificationEnabled } from "@/lib/notifications";
import { getActiveSeason } from "@/lib/seasons";
import { siteOrigin } from "@/lib/site-url";

// Win back players who played a previous season but haven't shown up for the
// current one. The rollover announcement already goes out the moment a season
// starts (endActiveSeasonAndStartNext); this is the follow-up for everyone who
// didn't act on it, which after the Preseason → Season 1 rollover was roughly
// 70% of the previous season's playerbase.
//
// Deliberately batched rather than one bulk send: DMs go out a second apart,
// so a few thousand recipients is far longer than any one function invocation
// gets. Each batch stamps reengagedAt, and the candidate query excludes anyone
// already stamped since the season began — so the cron can be interrupted,
// retried, or run twice in a tick without anyone getting messaged twice.
export const REENGAGEMENT_BATCH_SIZE = 40;

type Candidate = {
  id: string;
  discordId: string;
  notificationsDisabled: string[];
  notifyQueueOpportunitiesDm: boolean;
};

// Everyone eligible for a nudge right now, newest-active first so the most
// recently engaged (and most likely to return) are reached first if the
// campaign is ever cut short.
async function findDormantPlayers(seasonStartsAt: Date, limit: number): Promise<Candidate[]> {
  const candidates = await prisma.user.findMany({
    where: {
      status: UserStatus.ACTIVE,
      // Played before — this is a win-back, not an onboarding nudge.
      gamesPlayed: { gt: 0 },
      // ...but nothing since the season began, on either side of a match.
      NOT: {
        OR: [
          { matchesAsP1: { some: { status: MatchStatus.CONFIRMED, confirmedAt: { gte: seasonStartsAt } } } },
          { matchesAsP2: { some: { status: MatchStatus.CONFIRMED, confirmedAt: { gte: seasonStartsAt } } } },
        ],
      },
      // Not already nudged for this season.
      OR: [{ reengagedAt: null }, { reengagedAt: { lt: seasonStartsAt } }],
    },
    select: {
      id: true,
      discordId: true,
      notificationsDisabled: true,
      notifyQueueOpportunitiesDm: true,
    },
    orderBy: { lastSignInAt: "desc" },
    // Over-fetch: the notification opt-out is a string[] column, so it's
    // filtered in JS below and some of these will drop out.
    take: limit * 3,
  });

  return candidates
    .filter((player) => isNotificationEnabled(player, "DM_SEASON_ROLLOVER"))
    .slice(0, limit);
}

export function reengagementMessage(seasonName: string, endsAt: Date | null) {
  const deadline = endsAt
    ? ` It runs until ${endsAt.toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`
    : "";
  return [
    `👋 ${seasonName} is underway on Smash Ladder NA and you haven't played a set yet.${deadline}`,
    "",
    "Ratings reset at the start of the season, so everyone's on the same footing — queue up whenever you've got a few minutes and you'll be paired with someone around your level.",
    "",
    `${siteOrigin()}/lobby`,
    "",
    "(Don't want these? Settings → Notifications turns them off.)",
  ].join("\n");
}

export type ReengagementResult = {
  seasonName: string;
  eligible: number;
  sent: number;
  dryRun: boolean;
};

// Returns what it would do (dryRun) or what it did. The caller decides
// whether to commit — the cron runs it for real, the admin preview doesn't.
export async function sendReengagementBatch({
  limit = REENGAGEMENT_BATCH_SIZE,
  dryRun = false,
}: { limit?: number; dryRun?: boolean } = {}): Promise<ReengagementResult | null> {
  const season = await getActiveSeason();
  if (!season) return null;

  const batch = await findDormantPlayers(season.startsAt, limit);
  const result: ReengagementResult = {
    seasonName: season.name,
    eligible: batch.length,
    sent: 0,
    dryRun,
  };
  if (dryRun || batch.length === 0) return result;

  // Stamp before sending, not after: a DM that fails is swallowed by design
  // (sendDiscordDM never throws), so the only failure mode worth guarding is
  // the invocation dying mid-batch — in which case a re-run should move on
  // rather than retry the same people indefinitely.
  await prisma.user.updateMany({
    where: { id: { in: batch.map((p) => p.id) } },
    data: { reengagedAt: new Date() },
  });

  const message = reengagementMessage(season.name, season.scheduledEndAt);
  await sendDiscordDMsSequentially(
    batch.map((p) => ({ discordId: p.discordId })),
    message,
  );
  result.sent = batch.length;
  return result;
}

// How many players are still waiting on a nudge — for the admin preview, so
// the size of a campaign is visible before it starts going out.
export async function countDormantPlayers(): Promise<{ seasonName: string; remaining: number } | null> {
  const season = await getActiveSeason();
  if (!season) return null;
  const candidates = await findDormantPlayers(season.startsAt, 100_000);
  return { seasonName: season.name, remaining: candidates.length };
}
