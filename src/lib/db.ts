import { existsSync } from "node:fs";
import { config } from "dotenv";

// Same lookup order as prisma.config.ts (and Next.js): the per-environment files
// are read before the shared `.env` so the first one to define a key wins. In
// the Next runtime this is already a no-op — the framework populated
// process.env before this module ran — but scripts run directly through `tsx`
// import this file first, and without the matching order they'd read the
// production credentials in `.env` instead of the local database
// `.env.development` points at. Pass DATABASE_URL inline to target a specific
// database from a script.
for (const file of [".env.development.local", ".env.local", ".env.development", ".env"]) {
  if (existsSync(file)) config({ path: file });
}
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // Runtime queries go through Neon's PgBouncer pooler. DATABASE_URL/DIRECT_URL
  // are unpooled and reserved for `prisma migrate`/`generate` — using them here
  // would open one direct Postgres connection per serverless invocation and
  // exhaust Neon's connection limit under real concurrency.
  const connectionString = process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL;
  // pg.Pool defaults to 10 connections, which a burst of concurrent
  // interactive transactions (lobby pairing, match confirmation) can exhaust
  // within Prisma's default 2s maxWait — Neon's pooler comfortably handles a
  // larger client-side pool since it's fanning out over PgBouncer anyway.
  const adapter = new PrismaPg({ connectionString, max: 20 });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Prisma's $transaction defaults (2s to acquire a connection, 5s to run) are
// tight for our lobby/match transactions under concurrent bursts — give them
// more room to queue instead of failing outright.
export const TX_OPTIONS = { maxWait: 8000, timeout: 10000 };

// Postgres SQLSTATEs for transient contention: deadlock_detected and
// serialization_failure. Both mean "retry, nothing is actually wrong."
const TRANSIENT_PG_CODES = new Set(["40P01", "40001"]);

function transientCode(err: unknown): string | undefined {
  const cause = (err as { cause?: { code?: string } } | undefined)?.cause;
  return cause?.code;
}

// Concurrent joins racing to claim the same lobby entry can deadlock in
// Postgres even though our own claim logic (conditional updateMany) is
// correct — that's expected under contention and safe to just retry.
export async function withTransientRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = transientCode(err);
      if (!code || !TRANSIENT_PG_CODES.has(code) || attempt === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1) + Math.random() * 50));
    }
  }
  throw new Error("unreachable");
}
