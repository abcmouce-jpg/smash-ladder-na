import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

// Grace window after a Ko-fi payment before perks lapse. Ko-fi has no
// subscription-cancelled webhook — only successful-payment ones — so a
// monthly membership's "still active" has to be inferred from how recently
// the last payment landed rather than pushed to us. Long enough to absorb a
// renewal landing a few days late (card decline retry, Ko-fi's own billing
// day drift), short enough that a real cancellation loses perks within one
// missed cycle.
export const KOFI_SUPPORTER_GRACE_DAYS = 35;

// The source of truth for "does this account currently get supporter perks"
// — every read site (session, profile badge, admin list) should derive from
// this rather than trusting the raw isSupporter column directly, since that
// column alone doesn't know a Ko-fi-granted grant has lapsed.
export function isEffectiveSupporter(user: { isSupporter: boolean; supporterExpiresAt: Date | null }): boolean {
  if (!user.isSupporter) return false;
  if (user.supporterExpiresAt === null) return true; // admin-granted, no expiry
  return user.supporterExpiresAt.getTime() > Date.now();
}

// Short, easy to type (or paste) into Ko-fi's donation message field by
// hand. Not cryptographically sensitive — worst case of a guessed code is
// someone else's account getting ad-free perks, not an account takeover —
// so a short human-friendly code beats a long opaque one here.
function generateSupporterCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — easy to misread when copying by hand
  let code = "";
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return `LADDER-${code}`;
}

// Lazily creates and persists a code the first time a player visits the
// Settings supporter section, then always returns that same one afterward —
// never regenerated, so a code already sitting in a past Ko-fi receipt's
// message stays valid indefinitely.
export async function getOrCreateSupporterCode(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { supporterCode: true } });
  if (existing?.supporterCode) return existing.supporterCode;

  // Collision odds with a 6-char, 33-symbol alphabet are astronomically low,
  // but the unique constraint means a collision would throw rather than
  // silently hand out someone else's code — retry a handful of times rather
  // than letting that one-in-a-billion request fail outright.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateSupporterCode();
    try {
      await prisma.user.update({ where: { id: userId }, data: { supporterCode: code } });
      return code;
    } catch {
      // Unique constraint hit — loop and try a new code.
    }
  }
  throw new Error("Could not allocate a unique supporter code after 5 attempts");
}
