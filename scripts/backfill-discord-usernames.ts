// One-off backfill: auth.ts used to store Discord's display name
// (global_name) in User.discordUsername instead of the actual handle
// (username) — fixed for new sign-ins, but every account that hasn't signed
// in since the fix still has the old, wrong value sitting on the row. This
// re-fetches each real account's current username from the Discord API
// (keyed off the stored discordId, no sign-in required) and updates it in
// place. Safe to re-run: it always reads Discord's current truth and only
// writes when the value actually changed.
//
// Usage: DATABASE_URL=<prod> DISCORD_BOT_TOKEN=<token> npx tsx scripts/backfill-discord-usernames.ts
import { prisma } from "../src/lib/db";
import { getDiscordUsername } from "../src/lib/discord-bot";

// Synthetic ids that were never real Discord snowflakes — see deleteMyAccount
// (deleted-*), auth.ts's dev-credentials path (dev-*), and the practice-bot
// seed accounts (practice-*). None of these have anything to look up.
const SYNTHETIC_ID_PREFIXES = ["deleted-", "dev-", "practice-"];

// Discord rate-limits GET /users/{id} at 30/sec per the bucket header this
// endpoint returned when checked, but the bot's overall per-second budget is
// shared with whatever the live site is doing at the same time (match DMs,
// mod alerts, etc.) — 8/sec leaves headroom for that, and getDiscordUsername
// retries on a 429 anyway rather than misreporting a live account as missed.
const REQUESTS_PER_SECOND = 8;
const DELAY_MS = 1000 / REQUESTS_PER_SECOND;

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, discordId: true, discordUsername: true },
  });
  const targets = users.filter((u) => !SYNTHETIC_ID_PREFIXES.some((p) => u.discordId.startsWith(p)));

  console.log(`Checking ${targets.length} accounts (${users.length - targets.length} synthetic ids skipped)...`);

  let updated = 0;
  let unchanged = 0;
  let missed = 0;

  for (const [i, user] of targets.entries()) {
    const current = await getDiscordUsername(user.discordId);
    if (current === null) {
      missed++;
    } else if (current !== user.discordUsername) {
      await prisma.user.update({ where: { id: user.id }, data: { discordUsername: current } });
      updated++;
    } else {
      unchanged++;
    }

    if ((i + 1) % 200 === 0) {
      console.log(`${i + 1}/${targets.length} — ${updated} updated, ${unchanged} unchanged, ${missed} missed so far`);
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  console.log(`Done. ${updated} updated, ${unchanged} already correct, ${missed} missed (deleted Discord accounts, etc.).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
