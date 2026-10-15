// Read-only. Pulls the community server's full member roster once (cheap,
// paginated) instead of asking Discord about each of the 2,176 remaining
// recipients, then intersects it with the campaign audience.
//
// Point: the 25-recipient pilot delivered to 12 and was refused for 13. If
// "is in the community server" predicts that split, the expected yield of the
// rest of the campaign is knowable before sending anything.
import { prisma } from "../src/lib/db";
import { MatchStatus, UserStatus } from "../src/generated/prisma/enums";
import { DELETED_USERNAME } from "../src/lib/account";
import { getActiveSeason } from "../src/lib/seasons";

const API = "https://discord.com/api/v10";
const guildId = process.env.DISCORD_COMMUNITY_GUILD_ID!;

async function allGuildMemberIds(): Promise<Set<string> | null> {
  const ids = new Set<string>();
  let after = "0";
  for (let page = 0; page < 60; page++) {
    const res = await fetch(`${API}/guilds/${guildId}/members?limit=1000&after=${after}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    });
    if (res.status === 403) {
      console.error("403 listing members — the bot lacks the GUILD_MEMBERS privileged intent.");
      return null;
    }
    if (!res.ok) {
      console.error(`member list page ${page} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const batch = (await res.json()) as { user?: { id: string } }[];
    if (batch.length === 0) break;
    for (const m of batch) if (m.user?.id) ids.add(m.user.id);
    after = batch[batch.length - 1].user!.id;
    if (batch.length < 1000) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  return ids;
}

async function main() {
  const season = await getActiveSeason();
  if (!season) return;

  const members = await allGuildMemberIds();
  if (!members) return;
  console.log(`community server members: ${members.size}`);

  // Everyone the campaign still has to reach, same predicate as the lib.
  const remaining = await prisma.user.findMany({
    where: {
      status: UserStatus.ACTIVE,
      username: { not: DELETED_USERNAME },
      AND: [
        {
          OR: [
            { matchesAsP1: { some: { status: MatchStatus.CONFIRMED } } },
            { matchesAsP2: { some: { status: MatchStatus.CONFIRMED } } },
          ],
        },
        { OR: [{ reengagedAt: null }, { reengagedAt: { lt: season.startsAt } }] },
      ],
      NOT: {
        OR: [
          { matchesAsP1: { some: { status: MatchStatus.CONFIRMED, confirmedAt: { gte: season.startsAt } } } },
          { matchesAsP2: { some: { status: MatchStatus.CONFIRMED, confirmedAt: { gte: season.startsAt } } } },
          { discordId: { startsWith: "deleted-" } },
          { discordId: { startsWith: "dev-" } },
          { discordId: { startsWith: "practice-" } },
        ],
      },
    },
    select: { discordId: true, notificationsDisabled: true },
  });
  const audience = remaining.filter((u) => !u.notificationsDisabled.includes("DM_SEASON_ROLLOVER"));
  const inGuild = audience.filter((u) => members.has(u.discordId)).length;
  console.log(`\nstill to reach        : ${audience.length}`);
  console.log(`  in community server : ${inGuild}  (${((100 * inGuild) / audience.length).toFixed(1)}%)`);
  console.log(`  not in server       : ${audience.length - inGuild}`);

  // Check the predictor against the 25 just attempted.
  const blocked = new Set(process.argv.slice(2));
  const attempted = await prisma.user.findMany({
    where: { reengagedAt: { gte: season.startsAt } },
    select: { discordId: true },
  });
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const { discordId } of attempted) {
    const member = members.has(discordId);
    const wasBlocked = blocked.has(discordId);
    if (member && !wasBlocked) tp++;
    else if (member && wasBlocked) fp++;
    else if (!member && wasBlocked) tn++;
    else fn++;
  }
  console.log(`\npredictor check on the ${attempted.length} attempted so far:`);
  console.log(`  in server  & delivered : ${tp}`);
  console.log(`  in server  & refused   : ${fp}`);
  console.log(`  not in svr & refused   : ${tn}`);
  console.log(`  not in svr & delivered : ${fn}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
