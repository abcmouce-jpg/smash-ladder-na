import { prisma } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { startOfDayInTimeZone, LADDER_TIME_ZONE } from "@/lib/timezone";

// Single definition of "matches today" shared by the homepage, the Sets
// feed, and the admin overview — those three used to disagree (rolling 24h
// + CONFIRMED-only vs. calendar day + any status), which just meant three
// different numbers next to the same words on different pages. Calendar day
// in the ladder's reference timezone (not server- or viewer-relative, so it
// doesn't flip which matches count as "today" between visitors), any
// status — a match someone's mid-set in right now is still a match today.
export async function getMatchesTodayCount() {
  const todayStart = startOfDayInTimeZone(new Date());
  return prisma.ratingMatch.count({ where: { createdAt: { gte: todayStart } } });
}

// Distinct donors, not raw donation rows — a recurring Ko-fi subscription
// creates one KofiDonation per billing cycle, which would otherwise inflate
// the headcount shown in the footer/lobby banner. Counts every donor
// regardless of isPublic: a headcount alone doesn't reveal who they are, so
// this doesn't need to respect the same opt-out as the /supporters list.
//
// fromName is the only donor identity Ko-fi's webhook gives us (no email or
// stable donor id in the payload — see the kofi webhook route), and it
// defaults to "Anonymous" when a donor doesn't set one. Deduping on it
// naively would collapse every distinct anonymous donor into a single
// "supporter", so only named rows get deduped against each other; each
// "Anonymous" row counts as its own supporter instead.
export async function getSupporterCount() {
  const donors = await prisma.kofiDonation.findMany({ select: { fromName: true } });
  const namedSeen = new Set<string>();
  let count = 0;
  for (const { fromName } of donors) {
    if (fromName === "Anonymous" || !namedSeen.has(fromName)) {
      if (fromName !== "Anonymous") namedSeen.add(fromName);
      count++;
    }
  }
  return count;
}

// Deliberately narrower than admin-stats.ts — no dispute/report/ban counts
// here, since this feeds the public homepage, not the mod dashboard.
export async function getPublicStats() {
  const [totalPlayers, matchesToday, topPlayers, activeMatchCount] = await Promise.all([
    prisma.user.count(),
    getMatchesTodayCount(),
    prisma.user.findMany({
      where: { gamesPlayed: { gte: LEADERBOARD_MIN_GAMES } },
      orderBy: { rating: "desc" },
      take: 3,
      select: { id: true, username: true, avatarUrl: true, rating: true, gamesPlayed: true },
    }),
    // "currently in a match" is counted through RatingMatch.status, not
    // RatingLobbyEntry — PAIRED lobby entries never get cleaned up once a
    // match resolves (they just sit there forever), so counting those would
    // wildly overcount. Same definition as getLobbyActivityStats' inMatch —
    // this used to also add in queued-but-not-yet-matched players, which
    // inflated "playing now" with people who weren't actually playing yet
    // and made it disagree with the Lobby page's own "currently playing"
    // count for the same real-time state.
    prisma.ratingMatch.count({
      where: { status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED] } },
    }),
  ]);

  const playingNow = activeMatchCount * 2;

  return { totalPlayers, matchesToday, topPlayers, playingNow };
}

// Volume side of the homepage's "make status visible" rows — top players by
// confirmed sets played rather than rating. Same LEADERBOARD_MIN_GAMES floor
// as the rating leaderboard: right after a season reset everyone sits at 0,
// and this section should render nothing rather than arbitrary one-set players.
export async function getTopGrinders(limit = 3) {
  return prisma.user.findMany({
    where: { gamesPlayed: { gte: LEADERBOARD_MIN_GAMES } },
    orderBy: { gamesPlayed: "desc" },
    take: limit,
    select: { id: true, username: true, avatarUrl: true, gamesPlayed: true },
  });
}

// One window of confirmed matches, read once, carrying everything both
// activity charts need.
//
// The per-day chart needs the raw instants because it buckets by the *viewer's*
// timezone, which only the browser knows; the per-hour chart buckets by the
// ladder's own reference timezone (lib/timezone.ts), which the server can do.
// Those used to be two separate reads of the identical query, so a page showing
// both (the Stats overview) scanned and shipped the whole window twice — hence
// one read, with the single-purpose getter below for callers that need only the
// per-day shape.
//
// The extra day of margin keeps the last N viewer-local days complete for any
// timezone: the earliest instant of the Nth local day back can sit up to ~24h
// before "now minus N UTC days" (e.g. a UTC+14 visitor at local midnight), so
// a plain N-day cutoff would silently drop matches from the oldest displayed
// day. The client discards anything outside its window.
//
// timestamps are ISO strings rather than Dates so this stays plain data — the
// per-day chart parses them back in the browser.
export type LadderActivity = {
  windowDays: number;
  timestamps: string[];
  hourlyCounts: number[];
};

export async function getLadderActivity(days: number): Promise<LadderActivity> {
  const since = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000);
  const matches = await prisma.ratingMatch.findMany({
    where: { status: MatchStatus.CONFIRMED, confirmedAt: { gte: since } },
    select: { confirmedAt: true },
    orderBy: { confirmedAt: "asc" },
  });

  const timestamps: string[] = [];
  // Bucketing by hour happens server-side rather than in the chart because hour
  // boundaries come from the ladder's own timezone (America/New_York), not each
  // visitor's — mirroring how "matches today" is counted everywhere else.
  const hourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: LADDER_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  });
  const hourlyCounts = new Array<number>(24).fill(0);

  for (const m of matches) {
    if (!m.confirmedAt) continue;
    timestamps.push(m.confirmedAt.toISOString());
    const hour = Number(hourFormatter.format(m.confirmedAt));
    if (Number.isInteger(hour) && hour >= 0 && hour < 24) hourlyCounts[hour]++;
  }

  return { windowDays: days, timestamps, hourlyCounts };
}

// Raw confirmedAt timestamps for the per-day chart — bucketing into "per day"
// happens in MatchesPerDayChart, not here, because day boundaries depend on the
// visitor's timezone and only the browser knows that.
export async function getMatchesPerDay(days = 30) {
  return (await getLadderActivity(days)).timestamps;
}
