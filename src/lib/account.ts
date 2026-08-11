import { prisma } from "@/lib/db";
import { UserStatus } from "@/generated/prisma/enums";
import { MATCH_DISTANCE_PRESETS, MATCH_REGIONS } from "@/lib/regions";
import { MATCH_RATING_GAP_PRESETS } from "@/lib/rank-tier";
import { REMATCH_COOLDOWN_PRESETS } from "@/lib/rematch-cooldown";

// Small-start launch control: while set, only players who've declared this
// exact region can join the ranked lobby or free battle. Unset (the default)
// once ready to open up beyond the initial region.
const LAUNCH_REGION_LOCK = process.env.LAUNCH_REGION_LOCK?.trim() || null;

function requireRegionUnlocked(region: string | null) {
  if (LAUNCH_REGION_LOCK && region !== LAUNCH_REGION_LOCK) {
    throw new Error(
      `Smash Ladder NA is ${LAUNCH_REGION_LOCK}-only while we ramp up — set your region to ${LAUNCH_REGION_LOCK} on the Lobby page to join in.`,
    );
  }
}

// A timed SUSPENDED (suspendedUntil in the past) lifts itself back to
// ACTIVE the next time anything checks status, rather than needing a cron —
// same lazy-read pattern used elsewhere (e.g. free battle/match expiry).
// Returns the up-to-date status. Exported so callers that display or act on
// status (getPlayerProfile, moderateUserDirectly, actionReport) can lift a
// stale expired suspension before reading/comparing it — otherwise a mod
// re-suspending someone whose old suspension already expired sees it
// refused as "already suspended" instead of applying.
export async function liftExpiredSuspension(
  userId: string,
  user: { status: UserStatus; suspendedUntil: Date | null },
): Promise<UserStatus> {
  if (user.status !== UserStatus.SUSPENDED || !user.suspendedUntil || user.suspendedUntil > new Date()) {
    return user.status;
  }
  await prisma.user.update({
    where: { id: userId },
    data: { status: UserStatus.ACTIVE, suspendedUntil: null },
  });
  return UserStatus.ACTIVE;
}

// Two graduated restriction levels (mirrors Smashmate's manner-violation
// tiers): a BANNED user (Level 2) loses everything. A SUSPENDED user
// (Level 1) keeps playing ranked — that's the core activity, and disputes
// already give it its own accountability path — but loses the lighter-touch
// privileges: free battle and filing new conduct reports (no retaliation).
//
// Session/JWT data can go stale, so both checks re-read status fresh from
// the DB rather than trusting whatever was true at sign-in.
export async function requireNotBanned(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { status: true, region: true, suspendedUntil: true },
  });
  if (user.status === UserStatus.BANNED) {
    throw new Error("Your account has been banned.");
  }
  requireRegionUnlocked(user.region);
}

export async function requireActiveUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { status: true, region: true, suspendedUntil: true },
  });
  if (user.status === UserStatus.BANNED) {
    throw new Error("Your account has been banned.");
  }
  const status = await liftExpiredSuspension(userId, user);
  if (status === UserStatus.SUSPENDED) {
    throw new Error(
      "Your account is suspended — free battle and reporting are unavailable, but ranked play still works.",
    );
  }
  requireRegionUnlocked(user.region);
}

const USERNAME_MAX_LENGTH = 32;

// Defaults to the Discord display name at account creation, but is fully
// self-managed after that (see the signIn callback in auth.ts) — a lot of
// players' Discord name doesn't match the tag they actually go by.
export async function setUsername(userId: string, username: string) {
  const trimmed = username.trim();
  if (!trimmed) throw new Error("Username is required");
  if (trimmed.length > USERNAME_MAX_LENGTH) {
    throw new Error(`Username must be ${USERNAME_MAX_LENGTH} characters or fewer`);
  }

  await prisma.user.update({ where: { id: userId }, data: { username: trimmed } });
}

export async function setUserRegion(userId: string, region: string | null) {
  if (region !== null && !(MATCH_REGIONS as readonly string[]).includes(region)) {
    throw new Error("Not a recognized region");
  }
  await prisma.user.update({ where: { id: userId }, data: { region } });
}

// Self-declared match radius, in km — null means worldwide. Widening this
// only affects this player's own searches; matching still requires the
// other side's radius to independently cover the same distance too.
export async function setMaxMatchDistance(userId: string, maxMatchDistanceKm: number | null) {
  const isValidPreset = MATCH_DISTANCE_PRESETS.some((preset) => preset.km === maxMatchDistanceKm);
  if (!isValidPreset) {
    throw new Error("Not a recognized match distance");
  }
  await prisma.user.update({ where: { id: userId }, data: { maxMatchDistanceKm } });
}

// Self-declared rating-gap tolerance — null means any rating. Same
// both-sides-must-cover-it logic as match distance.
export async function setMaxRatingGap(userId: string, maxRatingGap: number | null) {
  const isValidPreset = MATCH_RATING_GAP_PRESETS.some((preset) => preset.gap === maxRatingGap);
  if (!isValidPreset) {
    throw new Error("Not a recognized rating gap");
  }
  await prisma.user.update({ where: { id: userId }, data: { maxRatingGap } });
}

// Self-declared cooldown before rematching the same opponent — null means
// anytime. Same both-sides-must-cover-it logic as match distance/rating gap.
export async function setRematchCooldown(userId: string, rematchCooldownHours: number | null) {
  const isValidPreset = REMATCH_COOLDOWN_PRESETS.some((preset) => preset.hours === rematchCooldownHours);
  if (!isValidPreset) {
    throw new Error("Not a recognized rematch cooldown");
  }
  await prisma.user.update({ where: { id: userId }, data: { rematchCooldownHours } });
}

// A self-declared "wired" claim exists to help pair people with a stable
// connection — enough cancellations (a common symptom of connection
// trouble) makes that claim unreliable. Judged by ratio rather than a flat
// count: a long-time player with a handful of legitimate cancels across
// hundreds of games shouldn't be flagged the same as someone who cancels
// almost every match. WIRED_TRUST_MIN_CANCELS gates the ratio check so a
// tiny sample (e.g. a single cancel with 0 games played) doesn't trip it
// instantly. cancelMatch auto-clears the flag once someone crosses this;
// setWiredConnection blocks re-declaring it while still over the line.
export const WIRED_TRUST_MIN_CANCELS = 3;
export const WIRED_TRUST_MAX_CANCEL_RATIO = 0.25;

// Self-declared matching preference — "only pair me with opponents who
// have wiredConnection on." Independent of the wiredConnection fact itself,
// so this doesn't get gated by the trust check above.
export async function setRequireWiredOpponent(userId: string, requireWiredOpponent: boolean) {
  await prisma.user.update({ where: { id: userId }, data: { requireWiredOpponent } });
}

// Same shape — "never pair me with someone currently queuing to practice."
// See practiceMatchAllowed in lib/lobby.ts for how this is enforced.
export async function setAvoidPracticeOpponents(userId: string, avoidPracticeOpponents: boolean) {
  await prisma.user.update({ where: { id: userId }, data: { avoidPracticeOpponents } });
}

// Expanded display preference — hides the opponent's rating, username,
// characters, and avatar from this player's own lobby view, and replaces
// the opponent's name with "Opponent" in chat too.
export async function setZenMode(userId: string, zenMode: boolean) {
  await prisma.user.update({ where: { id: userId }, data: { zenMode } });
}

// Gates LobbyPoller's playMatchFoundChime (lib/sound.ts) — a player can turn
// off the audio cue that fires when they're paired, e.g. if they find it
// jarring, without losing the background-tab polling itself.
export async function setAudioPingOnMatch(userId: string, audioPingOnMatch: boolean) {
  await prisma.user.update({ where: { id: userId }, data: { audioPingOnMatch } });
}

// Only controls which landing page ("/" vs "/es") a signed-in visit to "/"
// bounces to — see the field's own comment in schema.prisma. `null` means
// English (the default); anything else falls back to English too, so a
// future removed-language value can't strand someone on a 404.
export async function setPreferredLanguage(userId: string, language: "es" | null) {
  await prisma.user.update({ where: { id: userId }, data: { preferredLanguage: language } });
}

export function isWiredClaimUntrustworthy(cancelCount: number, gamesPlayed: number) {
  if (cancelCount < WIRED_TRUST_MIN_CANCELS) return false;
  const ratio = cancelCount / (cancelCount + gamesPlayed);
  return ratio > WIRED_TRUST_MAX_CANCEL_RATIO;
}

// Same ratio-based shape as the wired-trust check above, but for
// automatically flagging/suspending a pattern of cancelling to dodge
// matches (bad matchup, rating gap, inconvenient character — see the
// "Canceling a match" rules copy) rather than legitimate one-offs. Two
// tiers: a warning DM fires first, at the looser threshold, so a player
// gets a chance to stop before the stricter threshold actually suspends
// them. Both are gated by a minimum sample size for the same reason as
// WIRED_TRUST_MIN_CANCELS — a couple of early cancels shouldn't trip
// either one.
export const CANCEL_WARNING_MIN_CANCELS = 5;
export const CANCEL_WARNING_MAX_RATIO = 0.3;
export const CANCEL_SUSPEND_MIN_CANCELS = 8;
export const CANCEL_SUSPEND_MAX_RATIO = 0.4;

// How long an auto-suspend from cancel abuse lasts before lifting itself
// (see liftExpiredSuspension) — long enough to actually cost something,
// short enough that it's a cooldown rather than something needing a mod to
// reverse for a first offense.
export const CANCEL_SUSPEND_DURATION_HOURS = 24;

export function isCancelWarningThreshold(cancelCount: number, gamesPlayed: number) {
  if (cancelCount < CANCEL_WARNING_MIN_CANCELS) return false;
  return cancelCount / (cancelCount + gamesPlayed) > CANCEL_WARNING_MAX_RATIO;
}

export function isCancelSuspendThreshold(cancelCount: number, gamesPlayed: number) {
  if (cancelCount < CANCEL_SUSPEND_MIN_CANCELS) return false;
  return cancelCount / (cancelCount + gamesPlayed) > CANCEL_SUSPEND_MAX_RATIO;
}

// Same idea as the cancel-based check above, but for opponents filing a
// connection report against this player — a "wired" claim ringing false to
// enough of the people who actually played them is just as strong a signal
// as their own cancel history. Same min-sample gate and ratio threshold.
export const WIRED_TRUST_MIN_CONNECTION_REPORTS = 3;
export const WIRED_TRUST_MAX_CONNECTION_REPORT_RATIO = 0.25;

export function isWiredClaimDisputedByOpponents(connectionReportsReceived: number, gamesPlayed: number) {
  if (connectionReportsReceived < WIRED_TRUST_MIN_CONNECTION_REPORTS) return false;
  const ratio = connectionReportsReceived / (connectionReportsReceived + gamesPlayed);
  return ratio > WIRED_TRUST_MAX_CONNECTION_REPORT_RATIO;
}

export async function setWiredConnection(userId: string, wired: boolean) {
  if (wired) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { cancelCount: true, gamesPlayed: true, _count: { select: { connectionReportsReceived: true } } },
    });
    if (isWiredClaimUntrustworthy(user.cancelCount, user.gamesPlayed)) {
      throw new Error(
        `Too many cancelled matches relative to games played (${user.cancelCount} cancelled, ${user.gamesPlayed} played) to self-declare a wired connection.`,
      );
    }
    if (isWiredClaimDisputedByOpponents(user._count.connectionReportsReceived, user.gamesPlayed)) {
      throw new Error(
        `Too many opponents have reported connection issues with you (${user._count.connectionReportsReceived} reports, ${user.gamesPlayed} games played) to self-declare a wired connection.`,
      );
    }
  }
  await prisma.user.update({ where: { id: userId }, data: { wiredConnection: wired } });
}

// Anonymize rather than hard-delete: match history, ratings, and comments
// involve other players' legitimate competitive records too, and Prisma's
// default onDelete: Restrict on most of this user's relations would just
// throw anyway. Scrambling discordId means a future login with the same
// Discord account starts a genuinely fresh row instead of reviving this one.
export async function deleteMyAccount(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      username: "Deleted User",
      avatarUrl: null,
      email: null,
      discordId: `deleted-${userId}`,
      mainCharacter: null,
      region: null,
      wiredConnection: false,
    },
  });
  // The row is kept (anonymized), so the subscription rows' onDelete: Cascade
  // never fires — drop them explicitly so the ghost account can't keep
  // receiving match-found pushes nobody asked for.
  await prisma.pushSubscription.deleteMany({ where: { userId } });
}
