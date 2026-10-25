// Applies pending migrations before a build — but only for the build whose
// database they belong to.
//
// `prebuild: prisma migrate deploy` ran for every build, and on Vercel that
// includes a preview build for any pushed branch. This project's preview
// environment resolves DIRECT_URL to the same Neon database as production, so
// pushing a feature branch applied its migrations to the live database before
// a line of its code was deployed. That happened: a branch push on
// 2026-10-25 put ALTER TYPE "RatingAlgorithm" ADD VALUE 'SMASHMATE' into NA
// production 11 seconds after the preview build started. Additive and
// harmless that time; a destructive migration on an unmerged branch would not
// have been.
//
// So: migrate on a production build, and never on a preview one. A local build
// is left alone — prisma.config.ts resolves DIRECT_URL from .env.development
// there, which points at the local database, and the README's setup step
// expects that.
import { spawnSync } from "node:child_process";

const vercelEnv = process.env.VERCEL_ENV;

if (vercelEnv && vercelEnv !== "production") {
  console.log(
    `prebuild: skipping \`prisma migrate deploy\` on a ${vercelEnv} build — ` +
      "its DIRECT_URL is the production database (see scripts/prebuild-migrate.mjs).",
  );
  process.exit(0);
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });
process.exit(result.status ?? 1);
