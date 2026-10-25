import { prisma } from "@/lib/db";

// x-forwarded-for can be a comma-separated proxy chain (client, proxy1,
// proxy2, ...) — the first entry is the original client, which is what
// Vercel's edge network sets it to.
/**
 * The client IP for a request, from the headers Vercel's edge sets.
 *
 * Deliberately NOT the leftmost x-forwarded-for entry. x-forwarded-for is a
 * list that each hop appends to, so its leftmost entry is whatever the client
 * sent — and a client can send anything. Reading it meant a banned player
 * evaded isIpBanned by adding one header, and could write any address they
 * liked into another person's lastKnownIp for a mod to ban later.
 *
 * Vercel's own docs say the edge overwrites a client-supplied
 * x-forwarded-for, but community reports say it appends instead, and the two
 * cases disagree about which entry is real. The rightmost entry is correct
 * under both: the last hop before the function is Vercel itself, so whatever
 * it recorded there is the connection it actually saw, and if the header was
 * replaced outright the only entry is both leftmost and rightmost. x-real-ip
 * is preferred where present since it is a single value the edge sets and the
 * client cannot append to.
 *
 * Returns null off Vercel (local dev), which callers already treat as
 * "unknown" — isIpBanned passes, nothing is recorded.
 */
export function extractClientIp(headerValue: string | null, realIpHeaderValue: string | null = null): string | null {
  const realIp = realIpHeaderValue?.trim();
  if (realIp) return realIp;
  if (!headerValue) return null;
  const hops = headerValue
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops[hops.length - 1] ?? null;
}

export async function isIpBanned(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const banned = await prisma.bannedIp.findUnique({ where: { ip } });
  return banned !== null;
}

export async function banIp(ip: string, reason?: string) {
  const trimmed = ip.trim();
  if (!trimmed) throw new Error("IP address is required");
  await prisma.bannedIp.upsert({
    where: { ip: trimmed },
    update: { reason: reason?.trim() || undefined },
    create: { ip: trimmed, reason: reason?.trim() || undefined },
  });
}

export async function unbanIp(ip: string) {
  await prisma.bannedIp.deleteMany({ where: { ip: ip.trim() } });
}

export async function listBannedIps() {
  return prisma.bannedIp.findMany({ orderBy: { createdAt: "desc" } });
}
