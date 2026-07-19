import { prisma } from "@/lib/db";
import { UserStatus } from "@/generated/prisma/enums";
import { NA_REGIONS } from "@/lib/regions";

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
  if (region !== null && !(NA_REGIONS as readonly string[]).includes(region)) {
    throw new Error("Not a recognized region");
  }
  await prisma.user.update({ where: { id: userId }, data: { region } });
}

// A self-declared "wired" claim exists to help pair people with a stable
// connection — enough cancellations (a common symptom of connection
// trouble) makes that claim unreliable, so it stops being self-settable
// past this point. cancelMatch also auto-clears the flag when a cancel
// pushes someone over this line.
export const WIRED_TRUST_CANCEL_THRESHOLD = 3;

export async function setWiredConnection(userId: string, wired: boolean) {
  if (wired) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { cancelCount: true },
    });
    if (user.cancelCount >= WIRED_TRUST_CANCEL_THRESHOLD) {
      throw new Error(
        `Too many cancelled matches (${user.cancelCount}) to self-declare a wired connection.`,
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
