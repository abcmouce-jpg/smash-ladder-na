import { prisma } from "@/lib/db";

// The ladder-wide default, documented on /rules — anyone who doesn't set
// their own just uses this, so opponents never have to ask. A player who
// streams can override it in Settings so their in-game password isn't the
// one thing on the whole site guaranteed to be public.
export const DEFAULT_ARENA_PASSWORD = "1122";

export function effectiveArenaPassword(user: { arenaPassword: string | null }): string {
  return user.arenaPassword?.trim() || DEFAULT_ARENA_PASSWORD;
}

const MAX_ARENA_PASSWORD_LENGTH = 20;

export async function setArenaPassword(userId: string, password: string) {
  const trimmed = password.trim();
  if (trimmed.length > MAX_ARENA_PASSWORD_LENGTH) {
    throw new Error(`Arena password can't be longer than ${MAX_ARENA_PASSWORD_LENGTH} characters`);
  }
  // An empty submission resets back to the shared default.
  await prisma.user.update({ where: { id: userId }, data: { arenaPassword: trimmed || null } });
}
