// Runs the Season 1 win-back campaign: a one-time DM to every player who
// played a previous season but hasn't played a set since this one began.
//
// Why a local script rather than the cron route the lib was written for: at one
// DM per second, 2,202 recipients is over half an hour of wall time, which no
// serverless invocation gets. The campaign is also a one-off — wiring a cron
// that fires forever to send a message that should go out once would be the
// wrong shape. State lives in User.reengagedAt, so this is interruptible and
// resumable: re-running picks up exactly whoever has not been reached yet.
//
// Usage (dry run prints the audience and the exact message, sends nothing):
//   npx tsx scripts/send-reengagement.ts
//   npx tsx scripts/send-reengagement.ts --apply --limit 25      # pilot
//   npx tsx scripts/send-reengagement.ts --apply                 # the rest
//
// Env must point at production: DATABASE_URL / DIRECT_URL, DISCORD_BOT_TOKEN,
// and SITE_URL (siteOrigin builds the /lobby link from it, so a
// missing value would mail everyone a localhost link).
import { prisma } from "../src/lib/db";
import { getActiveSeason } from "../src/lib/seasons";
import { siteOrigin } from "../src/lib/site-url";
import {
  countDormantPlayers,
  reengagementMessage,
  sendReengagementBatch,
  REENGAGEMENT_BATCH_SIZE,
} from "../src/lib/reengagement";
import { emptyDMTally, verifyDiscordBotToken } from "../src/lib/discord-bot";

const DISCORD_API = "https://discord.com/api/v10";

// Every recipient who shares no server with the bot is refused by Discord
// (50007) — on the Season 1 pilot that was 13 of 13, against 12 of 12 delivered
// for server members. Pulling the roster once costs a handful of requests and
// removes ~1,300 attempts that could only ever fail. Returns null when the
// roster cannot be read, and the caller then falls back to not filtering rather
// than silently mailing nobody.
async function communityServerMemberIds(): Promise<Set<string> | null> {
  const guildId = process.env.DISCORD_COMMUNITY_GUILD_ID;
  if (!guildId || guildId === "[SENSITIVE]") return null;
  const ids = new Set<string>();
  let after = "0";
  for (let page = 0; page < 60; page++) {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members?limit=1000&after=${after}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    });
    if (!res.ok) {
      console.error(
        `Could not list server members (${res.status})` +
          (res.status === 403 ? " — the bot lacks the GUILD_MEMBERS privileged intent." : ""),
      );
      return null;
    }
    const batch = (await res.json()) as { user?: { id: string } }[];
    for (const member of batch) if (member.user?.id) ids.add(member.user.id);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1].user!.id;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return ids;
}

// Slower than the gameplay default of 1/sec. A burst of identical unsolicited
// DMs is the exact pattern Discord's abuse detection flags, and this bot is
// also the site's OAuth provider — a suspension would stop every player from
// signing in, not just stop the DMs. 2 s/recipient puts the full campaign at
// roughly 75 minutes, which is cheap insurance against that.
const DEFAULT_DELAY_MS = 2000;

// Host only, never the credentials: printed so the operator can see which
// database a run is about to act on.
function databaseHost() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
  return url.replace(/^[a-z]+:\/\/[^@]*@/, "").replace(/[/?].*$/, "") || "(unset)";
}

function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

function value(name: string, fallback: number) {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const parsed = Number(process.argv[at + 1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function main() {
  const apply = flag("apply");
  const delayMs = value("delay-ms", DEFAULT_DELAY_MS);
  const limit = value("limit", Number.POSITIVE_INFINITY);

  const season = await getActiveSeason();
  if (!season) {
    console.error("No active season — nothing to win players back to.");
    process.exitCode = 1;
    return;
  }

  // --no-filter sends to the whole dormant audience, failures included, for a
  // run that deliberately wants the unfiltered behaviour.
  let allowDiscordIds: string[] | undefined;
  if (!flag("no-filter")) {
    const members = await communityServerMemberIds();
    if (members) {
      const everyone = await prisma.user.findMany({ select: { discordId: true } });
      allowDiscordIds = everyone.map((u) => u.discordId).filter((id) => members.has(id));
      console.log(`community server members: ${members.size}`);
    } else {
      console.warn("Proceeding without the reachability filter; expect most DMs to be refused.\n");
    }
  }

  const audience = await countDormantPlayers(allowDiscordIds);
  const unfiltered = allowDiscordIds ? await countDormantPlayers() : audience;
  console.log(`season        : ${season.name} (started ${season.startsAt.toISOString()})`);
  console.log(`site origin   : ${siteOrigin()}`);
  console.log(`database      : ${databaseHost()}`);
  console.log(`still to reach : ${audience?.remaining ?? 0}` +
    (allowDiscordIds ? ` reachable  (of ${unfiltered?.remaining ?? 0} dormant; the rest share no server with the bot)` : ""));
  console.log(`throttle      : ${delayMs} ms between DMs`);
  console.log(`limit         : ${Number.isFinite(limit) ? limit : "none (whole audience)"}`);
  console.log("");
  console.log("─── message as each recipient will see it ───");
  console.log(reengagementMessage(season.name, season.scheduledEndAt));
  console.log("────────────────────────────────────────────");
  console.log("");

  if (!apply) {
    console.log("Dry run — nothing sent. Re-run with --apply (and --limit for a pilot first).");
    return;
  }

  // tsx auto-loads .env, which on this project points at localhost:5432, and it
  // only skips a variable that is already exported. Sourcing the production env
  // first is therefore load-order-dependent, so refuse outright rather than run
  // the campaign against a dev database and report meaningless numbers.
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(databaseHost())) {
    console.error(`Refusing to --apply against a local database (${databaseHost()}).`);
    console.error("Source .env.production.local before running, and override DISCORD_BOT_TOKEN only.");
    process.exitCode = 1;
    return;
  }

  // Check the token before touching the audience. Without this the run spends
  // recipients to discover a broken token, and every one it "reaches" is marked
  // as reengaged — which is exactly what happened on the first pilot.
  const auth = await verifyDiscordBotToken();
  if (!auth.ok) {
    console.error(`Cannot send: ${auth.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(`bot authenticated as: ${auth.username}\n`);

  if (siteOrigin().includes("localhost")) {
    console.error("siteOrigin() is localhost: every DM would link players nowhere. Set SITE_URL.");
    process.exitCode = 1;
    return;
  }

  const totals = emptyDMTally();
  let reached = 0;
  const startedAt = Date.now();

  // One lib batch at a time so reengagedAt is committed incrementally: killing
  // this script loses at most the batch in flight, and the recipients it never
  // got to keep their stamp rolled back for the next run.
  while (reached < limit) {
    const batchLimit = Math.min(REENGAGEMENT_BATCH_SIZE, limit - reached);
    const result = await sendReengagementBatch({
      limit: batchLimit,
      delayMs,
      allowDiscordIds,
      onResult: (discordId, outcome) => {
        totals[outcome] += 1;
        if (outcome !== "sent") console.log(`  ${outcome.padEnd(13)} ${discordId}`);
      },
    });
    if (!result || result.eligible === 0) {
      console.log("\nAudience exhausted — everyone eligible has been reached.");
      break;
    }
    reached += result.eligible;
    const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
    console.log(
      `batch: eligible ${result.eligible}, sent ${result.sent}, blocked ${result.blocked}, ` +
        `requeued ${result.requeued} | running total sent ${totals.sent} | ${mins} min elapsed`,
    );
    if (result.stoppedEarly) {
      console.error(
        "\nDiscord started rate limiting, so the run stopped here rather than pushing through it.\n" +
          "Everyone it did not reach has had their stamp rolled back; re-run later to continue.",
      );
      break;
    }
  }

  console.log("\n=== campaign totals ===");
  for (const [outcome, count] of Object.entries(totals)) {
    if (count > 0) console.log(`  ${outcome.padEnd(13)} ${count}`);
  }
  const left = await countDormantPlayers(allowDiscordIds);
  console.log(`  still to reach ${left?.remaining ?? 0}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
