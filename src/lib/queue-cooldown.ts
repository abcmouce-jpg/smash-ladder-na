import type { Prisma } from "@/generated/prisma/client";

// Escalates 5 minutes per consecutive timeout — 1st: 5 min, 2nd: 10 min,
// 3rd: 15 min, etc.
export const TIMEOUT_COOLDOWN_STEP_MS = 5 * 60 * 1000;

// A timeout more than this long after the previous one starts a fresh
// streak instead of escalating further — someone who's played cleanly for
// a month shouldn't still be paying for a single old timeout.
export const TIMEOUT_COOLDOWN_RESET_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Pure escalation math, split out from applyTimeoutCooldown below so it's
// unit-testable without a database.
export function nextTimeoutCooldown(
  previous: { recentTimeoutCount: number; lastTimeoutAt: Date | null },
  now: Date,
): { recentTimeoutCount: number; cooldownUntil: Date } {
  const isStale =
    !previous.lastTimeoutAt || now.getTime() - previous.lastTimeoutAt.getTime() > TIMEOUT_COOLDOWN_RESET_WINDOW_MS;
  const recentTimeoutCount = (isStale ? 0 : previous.recentTimeoutCount) + 1;
  const cooldownUntil = new Date(now.getTime() + recentTimeoutCount * TIMEOUT_COOLDOWN_STEP_MS);
  return { recentTimeoutCount, cooldownUntil };
}

// Called alongside the existing noShowCount bump wherever a player gets
// auto-forfeited for going AFK (character-pick timeout, stale-report
// timeout) — queues them out of the matchmaking lobby for an escalating
// cooldown, checked by joinLobbyAndTryPair.
export async function applyTimeoutCooldown(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date = new Date(),
): Promise<Date> {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { recentTimeoutCount: true, lastTimeoutAt: true },
  });

  const { recentTimeoutCount, cooldownUntil } = nextTimeoutCooldown(user, now);

  await tx.user.update({
    where: { id: userId },
    data: {
      noShowCount: { increment: 1 },
      recentTimeoutCount,
      lastTimeoutAt: now,
      queueCooldownUntil: cooldownUntil,
    },
  });

  return cooldownUntil;
}
