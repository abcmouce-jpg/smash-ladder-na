import { prisma } from "@/lib/db";
import { DELETED_USERNAME } from "@/lib/account";
import { MatchStatus, UserStatus } from "@/generated/prisma/enums";
import { sendDiscordDMsSequentially, type DiscordDMOutcome } from "@/lib/discord-bot";
import { isNotificationEnabled } from "@/lib/notifications";
import { getActiveSeason } from "@/lib/seasons";
import { siteOrigin } from "@/lib/site-url";
import { LADDER_TIME_ZONE } from "@/lib/timezone";
import { SITE_NAME } from "@/lib/site";

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

// Ids that were never real Discord snowflakes, so there is nothing to DM:
// pre-2026 account deletions, auth.ts's dev-credentials path, and the
// practice-bot seed accounts.
export const SYNTHETIC_DISCORD_ID_PREFIXES = ["deleted-", "dev-", "practice-"];

type Candidate = {
  id: string;
  discordId: string;
  username: string;
  notificationsDisabled: string[];
  notifyQueueOpportunitiesDm: boolean;
};

// Everyone eligible for a nudge right now, newest-active first so the most
// recently engaged (and most likely to return) are reached first if the
// campaign is ever cut short.
async function findDormantPlayers(
  seasonStartsAt: Date,
  limit: number,
  // Restricts the campaign to recipients a DM can actually reach. Discord
  // refuses a bot DM (50007) to anyone who shares no server with the bot, and
  // on the Season 1 pilot that predicted the outcome for all 25 recipients
  // exactly: 12 of 12 server members received it, 13 of 13 non-members were
  // refused. Filtering in SQL rather than after the fact matters twice over —
  // a non-member is never stamped, so they stay eligible if they join later,
  // and the run does not spend 1,309 consecutive failed DM attempts, which is
  // the pattern Discord's abuse detection is watching for.
  allowDiscordIds?: string[],
): Promise<Candidate[]> {
  const candidates = await prisma.user.findMany({
    where: {
      status: UserStatus.ACTIVE,
      ...(allowDiscordIds ? { discordId: { in: allowDiscordIds } } : {}),
      // Played before — this is a win-back, not an onboarding nudge.
      //
      // Must be asked of the match history, NOT of gamesPlayed: the rollover
      // zeroes gamesPlayed for every user (endActiveSeasonAndStartNext), so
      // `gamesPlayed > 0` actually reads "played THIS season", which is the
      // exact complement of the dormancy condition below. The two together
      // matched 0 users on production — the whole campaign would have sent
      // nothing. Measured 2026-10-14: 3,815 users have ever played a confirmed
      // set against the 1,379 that gamesPlayed > 0 reported.
      AND: [
        {
          OR: [
            { matchesAsP1: { some: { status: MatchStatus.CONFIRMED } } },
            { matchesAsP2: { some: { status: MatchStatus.CONFIRMED } } },
          ],
        },
        // Not already nudged for this season.
        { OR: [{ reengagedAt: null }, { reengagedAt: { lt: seasonStartsAt } }] },
        // Not a deleted account. deleteMyAccount keeps the row (anonymized) and
        // leaves status ACTIVE, so these otherwise look exactly like dormant
        // players — 203 of the 2,405 production candidates were deleted
        // accounts. It also deletes their push subscriptions outright so "the
        // ghost account can't keep receiving match-found pushes nobody asked
        // for"; a win-back DM to someone who closed their account is the same
        // thing. Both signals are checked because the current delete path keeps
        // discordId real (on purpose — see lib/account.ts) while older ones
        // scrambled it to `deleted-${userId}`.
        { username: { not: DELETED_USERNAME } },
      ],
      // ...but nothing since the season began, on either side of a match.
      NOT: {
        OR: [
          { matchesAsP1: { some: { status: MatchStatus.CONFIRMED, confirmedAt: { gte: seasonStartsAt } } } },
          { matchesAsP2: { some: { status: MatchStatus.CONFIRMED, confirmedAt: { gte: seasonStartsAt } } } },
          // Ids that were never real Discord snowflakes and cannot be messaged:
          // older account deletions, auth.ts's dev-credentials path, and the
          // practice-bot seed accounts. Same list as
          // scripts/backfill-discord-usernames.ts.
          ...SYNTHETIC_DISCORD_ID_PREFIXES.map((prefix) => ({ discordId: { startsWith: prefix } })),
        ],
      },
    },
    select: {
      id: true,
      discordId: true,
      username: true,
      notificationsDisabled: true,
      notifyQueueOpportunitiesDm: true,
    },
    orderBy: { lastSignInAt: "desc" },
    // Over-fetch: the notification opt-out is a string[] column, so it's
    // filtered in JS below and some of these will drop out.
    take: limit * 3,
  });

  return candidates.filter((player) => isNotificationEnabled(player, "DM_SEASON_ROLLOVER")).slice(0, limit);
}

export function reengagementMessage(seasonName: string, endsAt: Date | null) {
  // Pinned to the ladder's own time zone, like the leaderboard countdown and
  // the rules page. Without it the rendered day depends on where the send runs:
  // Season 1 ends 2026-11-26T01:00Z, which is November 25 in ET — so a send
  // from a Vercel (UTC) function would have told players "November 26" while
  // the leaderboard they were being sent to said November 25.
  const deadline = endsAt
    ? ` It runs until ${endsAt.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        timeZone: LADDER_TIME_ZONE,
      })}.`
    : "";
  return [
    `👋 ${seasonName} is underway on ${SITE_NAME} and you haven't played a set yet.${deadline}`,
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
  // Recipients Discord refused permanently (DMs closed, no shared server,
  // deleted account). They stay stamped: retrying changes nothing.
  blocked: number;
  // Hit a rate limit or a transient error, so nothing arrived. Their stamp is
  // rolled back and the next run picks them up again.
  requeued: number;
  // True when the send stopped early because Discord started rate limiting.
  stoppedEarly: boolean;
  dryRun: boolean;
};

// Returns what it would do (dryRun) or what it did. The caller decides
// whether to commit — the cron runs it for real, the admin preview doesn't.
export async function sendReengagementBatch({
  limit = REENGAGEMENT_BATCH_SIZE,
  dryRun = false,
  delayMs,
  onResult,
  allowDiscordIds,
}: {
  limit?: number;
  dryRun?: boolean;
  /** Only these recipients; see findDormantPlayers. */
  allowDiscordIds?: string[];
  // A bulk campaign wants to go slower than the gameplay default and to print
  // as it goes; both are left to the caller rather than baked in here.
  delayMs?: number;
  onResult?: (discordId: string, outcome: DiscordDMOutcome) => void;
} = {}): Promise<ReengagementResult | null> {
  const season = await getActiveSeason();
  if (!season) return null;

  const batch = await findDormantPlayers(season.startsAt, limit, allowDiscordIds);
  const result: ReengagementResult = {
    seasonName: season.name,
    eligible: batch.length,
    sent: 0,
    blocked: 0,
    requeued: 0,
    stoppedEarly: false,
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
  const unreached: string[] = [];
  const byDiscordId = new Map(batch.map((p) => [p.discordId, p.id]));

  const tally = await sendDiscordDMsSequentially(
    batch.map((p) => ({ discordId: p.discordId })),
    message,
    delayMs,
    {
      onResult: (discordId, outcome) => {
        // Rate limits and transient errors mean the message never landed, so
        // undo the stamp for those recipients. A "blocked" recipient keeps
        // theirs: Discord will refuse them again tomorrow for the same reason.
        if (outcome === "rate_limited" || outcome === "error" || outcome === "no_token" || outcome === "unauthorized") {
          const id = byDiscordId.get(discordId);
          if (id) unreached.push(id);
        }
        onResult?.(discordId, outcome);
      },
      // Pushing on through 429s is what gets a Discord application suspended,
      // and this bot is also the site's OAuth provider — a suspension would
      // stop everyone signing in, so the campaign is the thing that yields.
      onRateLimit: () => true,
    },
  );

  // Anyone the send never reached at all (it stopped early) is also unreached.
  const attempted = tally.sent + tally.blocked + tally.unauthorized + tally.rate_limited + tally.error + tally.no_token;
  if (attempted < batch.length) {
    result.stoppedEarly = true;
    for (const player of batch.slice(attempted)) unreached.push(player.id);
  }

  if (unreached.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: unreached } },
      data: { reengagedAt: null },
    });
  }

  result.sent = tally.sent;
  result.blocked = tally.blocked;
  result.requeued = unreached.length;
  return result;
}

// How many players are still waiting on a nudge — for the admin preview, so
// the size of a campaign is visible before it starts going out.
export async function countDormantPlayers(
  allowDiscordIds?: string[],
): Promise<{ seasonName: string; remaining: number } | null> {
  const season = await getActiveSeason();
  if (!season) return null;
  const candidates = await findDormantPlayers(season.startsAt, 100_000, allowDiscordIds);
  return { seasonName: season.name, remaining: candidates.length };
}
