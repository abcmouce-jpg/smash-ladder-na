import { prisma } from "@/lib/db";
import { UserStatus } from "@/generated/prisma/enums";
import { MATCH_DISTANCE_PRESETS, MATCH_REGIONS } from "@/lib/regions";

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
    select: { status: true, region: true },
  });
  if (user.status === UserStatus.BANNED) {
    throw new Error("Your account has been banned.");
  }
  requireRegionUnlocked(user.region);
}

export async function requireActiveUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { status: true, region: true },
  });
  if (user.status === UserStatus.BANNED) {
    throw new Error("Your account has been banned.");
  }
  if (user.status === UserStatus.SUSPENDED) {
    throw new Error(
      "Your account is suspended — free battle and reporting are unavailable, but ranked play still works.",
    );
  }
  requireRegionUnlocked(user.region);
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

export function isWiredClaimUntrustworthy(cancelCount: number, gamesPlayed: number) {
  if (cancelCount < WIRED_TRUST_MIN_CANCELS) return false;
  const ratio = cancelCount / (cancelCount + gamesPlayed);
  return ratio > WIRED_TRUST_MAX_CANCEL_RATIO;
}

export async function setWiredConnection(userId: string, wired: boolean) {
  if (wired) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { cancelCount: true, gamesPlayed: true },
    });
    if (isWiredClaimUntrustworthy(user.cancelCount, user.gamesPlayed)) {
      throw new Error(
        `Too many cancelled matches relative to games played (${user.cancelCount} cancelled, ${user.gamesPlayed} played) to self-declare a wired connection.`,
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
}
