import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db";

// Identifiable prefix (like GitHub PATs) so a leaked token is recognizable
// on sight. Only the hash is ever persisted — same reasoning as a password,
// a DB read alone can't hand out something usable.
const TOKEN_PREFIX = "snma_";

function hashToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function generateApiToken(userId: string, name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Give the token a name so you can tell it apart later.");

  const rawToken = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  await prisma.apiToken.create({
    data: { userId, name: trimmedName, tokenHash: hashToken(rawToken) },
  });
  // Only time the raw value exists outside this function — the caller must
  // show it to the player now, it can't be recovered afterward.
  return rawToken;
}

export async function listApiTokens(userId: string) {
  return prisma.apiToken.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
  });
}

export async function revokeApiToken(userId: string, tokenId: string) {
  // Scoped to userId so one player can't revoke another's token by guessing
  // an id — updateMany silently no-ops instead of throwing on a mismatch.
  await prisma.apiToken.updateMany({
    where: { id: tokenId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Resolves the Authorization: Bearer <token> header on an /api/v1/* request
// to the player it belongs to, or null if missing/invalid/revoked.
export async function resolveApiUser(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const rawToken = header.slice("Bearer ".length).trim();
  if (!rawToken) return null;

  const token = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { userId: true, revokedAt: true },
  });
  if (!token || token.revokedAt) return null;

  // Best-effort, same reasoning as auth.ts's lastSignInAt — must never block
  // or fail the actual request just because this bookkeeping write hiccups.
  prisma.apiToken.update({ where: { tokenHash: hashToken(rawToken) }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return token.userId;
}
