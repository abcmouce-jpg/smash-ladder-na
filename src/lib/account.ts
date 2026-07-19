import { prisma } from "@/lib/db";
import { UserStatus } from "@/generated/prisma/enums";
import { NA_REGIONS } from "@/lib/regions";

// Small-start launch control: while set, only players who've declared this
// exact region can join the ranked lobby or free battle. Unset (the default)
// once ready to open up beyond the initial region.
const LAUNCH_REGION_LOCK = process.env.LAUNCH_REGION_LOCK?.trim() || null;

// Session/JWT data can go stale, so actions that mutate ladder state re-check
// status fresh from the DB rather than trusting whatever was true at sign-in.
export async function requireActiveUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { status: true, region: true },
  });
  if (user.status === UserStatus.BANNED) {
    throw new Error("Your account has been banned.");
  }
  if (user.status === UserStatus.SUSPENDED) {
    throw new Error("Your account is suspended.");
  }
  if (LAUNCH_REGION_LOCK && user.region !== LAUNCH_REGION_LOCK) {
    throw new Error(
      `Smash Ladder NA is ${LAUNCH_REGION_LOCK}-only while we ramp up — set your region to ${LAUNCH_REGION_LOCK} on the Lobby page to join in.`,
    );
  }
}

export async function setUserRegion(userId: string, region: string | null) {
  if (region !== null && !(NA_REGIONS as readonly string[]).includes(region)) {
    throw new Error("Not a recognized region");
  }
  await prisma.user.update({ where: { id: userId }, data: { region } });
}

export async function setWiredConnection(userId: string, wired: boolean) {
  await prisma.user.update({ where: { id: userId }, data: { wiredConnection: wired } });
}
