import { prisma } from "@/lib/db";
import { UserStatus } from "@/generated/prisma/enums";

// Session/JWT data can go stale, so actions that mutate ladder state re-check
// status fresh from the DB rather than trusting whatever was true at sign-in.
export async function requireActiveUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { status: true },
  });
  if (user.status === UserStatus.BANNED) {
    throw new Error("Your account has been banned.");
  }
  if (user.status === UserStatus.SUSPENDED) {
    throw new Error("Your account is suspended.");
  }
}
