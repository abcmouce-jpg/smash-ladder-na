// Runs a command with the local-development environment, and refuses if that
// environment names a database this machine does not own.
//
// `next build` and `next start` both run in production mode, so the files
// Next.js reads are .env.production.local → .env.local → .env.production →
// .env. .env.development.local is not among them. That means checking a
// production build locally picked up the deployed credentials in
// .env.production.local for the database, and the deployed NEXT_PUBLIC_*
// values in .env.local for everything baked in at build time — so a local
// build came out as the Japanese instance pointed at a deployed database. A
// read-only page render did no damage; the next thing to do it might not be
// as lucky.
//
// Next.js only fills in environment variables that are not already set, so
// loading the development overrides here and then handing off wins over those
// files without editing either of them.
//
// Usage: node scripts/with-local-env.mjs <command> [args...]
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { config } from "dotenv";

// Same order and the same first-wins behavior as prisma.config.ts, for the
// same reason: whichever file Next.js itself would have picked in development
// is the one that should decide.
for (const file of [".env.development.local", ".env.local", ".env.development", ".env"]) {
  if (existsSync(file)) config({ path: file });
}

const url = process.env.DATABASE_URL ?? "";
// A deployed database reached from a local command is the whole failure mode
// above, so refuse rather than warn. Checking the host, not a provider name:
// the question is "is this the machine I am on", which stays true whoever
// hosts the remote one.
if (!/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)) {
  console.error(
    "Refusing to run: DATABASE_URL does not point at localhost.\n" +
      "  Resolved host: " +
      (url.match(/@([^/?]*)/)?.[1] ?? "(DATABASE_URL is unset)") +
      "\n  Fix .env.development.local, or run the underlying next command directly if you" +
      " really mean to use a deployed database.",
  );
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/with-local-env.mjs <command> [args...]");
  process.exit(1);
}

spawn("npx", [command, ...args], { stdio: "inherit" }).on("exit", (code) => process.exit(code ?? 0));
