# Lobby Opponent Top-Characters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the opponent's most-played characters (up to 3, text-only) under their rating in the lobby's active "you've been matched" card.

**Architecture:** A new aggregation helper (`getTopCharacters`) reads `MatchGame` rows for a user, tallies character picks in application code (no raw SQL — same pattern as the existing `getTopRivals`), and returns up to 3 character names ranked by frequency. The lobby's `PairedView` server component calls it for the opponent and renders a conditional line, replacing an inline `mainCharacter` display that landed on `main` after this spec was first written (see Global Constraints).

**Tech Stack:** Next.js server components, Prisma (`MatchGame`, `RatingMatch`), Vitest (`*.integration.test.ts` against a real Postgres test DB).

## Global Constraints

- Only games from a `RatingMatch` with `status: CONFIRMED`, and only games with a non-null `winnerId`, count toward the tally (spec: "Inclusion rule").
- Ranking is by descending game count; ties break alphabetically by character name (spec: "Ranking").
- Default result size is 3; return fewer (down to `[]`) rather than padding (spec: "Result size").
- UI text is exactly `"Usually plays: A, B, C"` (comma-separated, most-played first); the line is omitted entirely when there are zero qualifying characters — no placeholder text (spec: "UI").
- This only touches the opponent's side of the active paired card in `PairedView`; the current user's own side, the post-match confirmed/cancelled view, and the profile page's `mainCharacter` field itself are all untouched (spec: "Scope").
- **This branch's base already includes commit `f239f2d`** ("Show the opponent's voted main character (as text) next to their name"), which added an inline `({opponent.mainCharacter})` span next to the opponent's username in this same card, plus a `mainCharacter: true` select in `matchWithPlayers` (`src/lib/matches.ts`). Per the spec's "Scope" section, this feature **supersedes and removes** both of those — only one character line (ours, computed from history) should remain per opponent. Task 2 includes removing them.

Full spec: `docs/superpowers/specs/2026-07-25-lobby-opponent-characters-design.md`

---

### Task 1: `getTopCharacters` aggregation helper

**Files:**
- Modify: `src/lib/players.ts` (append after `getTopRivals`, which currently ends at line 148)
- Create: `src/lib/players.integration.test.ts`

**Interfaces:**
- Produces: `getTopCharacters(userId: string, limit = 3): Promise<string[]>` — exported from `src/lib/players.ts`. Later tasks (Task 2) import this exact name and signature.

- [ ] **Step 1: Write the failing integration test**

Create `src/lib/players.integration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { getTopCharacters } from "@/lib/players";
import { MatchStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

async function createConfirmedMatch(p1: string, p2: string) {
  return prisma.ratingMatch.create({
    data: {
      player1Id: p1,
      player2Id: p2,
      status: MatchStatus.CONFIRMED,
      expiresAt: new Date(),
    },
  });
}

async function createPendingMatch(p1: string, p2: string) {
  return prisma.ratingMatch.create({
    data: {
      player1Id: p1,
      player2Id: p2,
      status: MatchStatus.PENDING_REPORT,
      expiresAt: new Date(),
    },
  });
}

async function createGame(
  matchId: string,
  gameNumber: number,
  actorAId: string,
  actorACharacter: string | null,
  actorBId: string,
  actorBCharacter: string | null,
  winnerId: string | null,
) {
  return prisma.matchGame.create({
    data: {
      matchId,
      gameNumber,
      actorAId,
      actorAStrikes: 1,
      actorACharacter,
      actorBId,
      actorBStrikes: 2,
      actorBCharacter,
      winnerId,
    },
  });
}

describe("getTopCharacters", () => {
  it("returns an empty array when the player has no qualifying games", async () => {
    const player = await createTestUser();
    expect(await getTopCharacters(player.id)).toEqual([]);
  });

  it("returns a single character when only one was played", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id);

    expect(await getTopCharacters(player.id)).toEqual(["Terry"]);
  });

  it("ranks characters by descending game count", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id);
    await createGame(match.id, 2, player.id, "Terry", opponent.id, "Ken", player.id);
    await createGame(match.id, 3, player.id, "Cloud", opponent.id, "Ken", player.id);

    expect(await getTopCharacters(player.id)).toEqual(["Terry", "Cloud"]);
  });

  it("breaks ties alphabetically", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Cloud", opponent.id, "Ken", player.id);
    await createGame(match.id, 2, player.id, "Bowser", opponent.id, "Ken", player.id);

    expect(await getTopCharacters(player.id)).toEqual(["Bowser", "Cloud"]);
  });

  it("excludes games from matches that aren't confirmed", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createPendingMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id);

    expect(await getTopCharacters(player.id)).toEqual([]);
  });

  it("excludes games with no winner (disputed/void)", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", null);

    expect(await getTopCharacters(player.id)).toEqual([]);
  });

  it("respects the limit parameter", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id);
    await createGame(match.id, 2, player.id, "Cloud", opponent.id, "Ken", player.id);
    await createGame(match.id, 3, player.id, "Bowser", opponent.id, "Ken", player.id);

    expect(await getTopCharacters(player.id, 2)).toHaveLength(2);
  });

  it("uses actorBCharacter when the player is recorded on the B side", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(opponent.id, player.id);
    await createGame(match.id, 1, opponent.id, "Ken", player.id, "Terry", player.id);

    expect(await getTopCharacters(player.id)).toEqual(["Terry"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:integration -- src/lib/players.integration.test.ts`
Expected: FAIL — `getTopCharacters` is not exported from `@/lib/players` (import error / `TypeError: getTopCharacters is not a function`).

- [ ] **Step 3: Implement `getTopCharacters`**

Append to `src/lib/players.ts` (after `getTopRivals`, which ends at line 148):

```ts
// For the lobby's "who am I about to play" scouting line. Only counts
// games from confirmed matches with a recorded winner — same filter
// tallySetWins in match-games.ts uses to skip disputed/void games.
export async function getTopCharacters(userId: string, limit = 3) {
  const games = await prisma.matchGame.findMany({
    where: {
      winnerId: { not: null },
      match: { status: MatchStatus.CONFIRMED },
      OR: [{ actorAId: userId }, { actorBId: userId }],
    },
    select: { actorAId: true, actorACharacter: true, actorBId: true, actorBCharacter: true },
  });

  const counts = new Map<string, number>();
  for (const g of games) {
    const character = g.actorAId === userId ? g.actorACharacter : g.actorBCharacter;
    if (!character) continue;
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([nameA, a], [nameB, b]) => b - a || nameA.localeCompare(nameB))
    .slice(0, limit)
    .map(([character]) => character);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:integration -- src/lib/players.integration.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Run the full test suites and typecheck**

Run: `npm test && npm run test:integration && npx tsc --noEmit && npm run lint`
Expected: all pass, no new failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/players.ts src/lib/players.integration.test.ts
git commit -m "$(cat <<'EOF'
Add getTopCharacters for ranking a player's most-played characters

Aggregates MatchGame character picks from confirmed matches, mirroring
the getTopRivals pattern already in players.ts.
EOF
)"
```

---

### Task 2: Render opponent's top characters in the lobby, superseding the inline mainCharacter text

**Files:**
- Modify: `src/lib/matches.ts:6-9` (remove the `mainCharacter` select added by `f239f2d` — no longer used by anything after this task)
- Modify: `src/app/lobby/page.tsx:6` (add import)
- Modify: `src/app/lobby/page.tsx:304-368` (`PairedView`: remove the inline `mainCharacter` span from `f239f2d`, fetch + render the new line)

**Interfaces:**
- Consumes: `getTopCharacters(userId: string, limit = 3): Promise<string[]>` from Task 1.

- [ ] **Step 1: Remove the `mainCharacter` select from `matchWithPlayers`**

`src/lib/matches.ts` currently reads (lines 6-9):

```ts
export const matchWithPlayers = {
  player1: { select: { id: true, username: true, avatarUrl: true, rating: true, mainCharacter: true } },
  player2: { select: { id: true, username: true, avatarUrl: true, rating: true, mainCharacter: true } },
} as const;
```

Change it to:

```ts
export const matchWithPlayers = {
  player1: { select: { id: true, username: true, avatarUrl: true, rating: true } },
  player2: { select: { id: true, username: true, avatarUrl: true, rating: true } },
} as const;
```

Confirm nothing else in the codebase reads `.mainCharacter` off a `matchWithPlayers`-shaped object before removing it:

Run: `grep -rn "mainCharacter" src/app/lobby/page.tsx src/lib/matches.ts`
Expected: two matches, both in `src/app/lobby/page.tsx` — removed in Step 3 below. If this prints matches anywhere else, stop and report NEEDS_CONTEXT instead of deleting the field.

- [ ] **Step 2: Add the `getTopCharacters` import**

In `src/app/lobby/page.tsx`, next to the existing `@/lib/lobby` import (currently line 6):

```ts
import { getActiveLobbyEntry, getLobbyActivityStats } from "@/lib/lobby";
import { getTopCharacters } from "@/lib/players";
```

- [ ] **Step 3: Remove the inline `mainCharacter` text and render `getTopCharacters` instead**

In `src/app/lobby/page.tsx`, `PairedView` currently reads (lines 304-368):

```tsx
async function PairedView({ userId, match }: { userId: string; match: Match }) {
  const opponent = match.player1Id === userId ? match.player2 : match.player1;

  if (match.status === "CONFIRMED" || match.status === "CANCELLED" || match.status === "EXPIRED") {
    return (
      <Card className="mt-4">
        {match.status === "CONFIRMED" ? (
          <ConfirmedSection userId={userId} match={match} opponentName={opponent.username} />
        ) : (
          <TerminatedSection status={match.status} />
        )}
        <CardContent className="border-t border-border pt-4">
          <Link
            href={`/players/${userId}`}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            View full match details on your profile →
          </Link>
        </CardContent>
      </Card>
    );
  }

  const games = await getMatchGames(match.id);
  const wins = { me: 0, opponent: 0 };
  for (const g of games) {
    if (g.winnerId === userId) wins.me++;
    else if (g.winnerId) wins.opponent++;
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <p className="badge-pop text-base font-semibold text-foreground">🎮 You&apos;ve been matched!</p>
          <Badge variant="secondary">{match.status.replace("_", " ").toLowerCase()}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        {opponent.avatarUrl && (
          <Image
            src={opponent.avatarUrl}
            alt={opponent.username}
            width={40}
            height={40}
            className="rounded-full"
          />
        )}
        <div>
          <p className="font-medium">
            {opponent.username}
            {opponent.mainCharacter && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({opponent.mainCharacter})
              </span>
            )}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">{opponent.rating} rating</p>
        </div>
        {games.length > 0 && (
          <Badge variant="outline" className="ml-auto tabular-nums">
            {wins.me}–{wins.opponent}
          </Badge>
        )}
      </CardContent>
```

Change it to (remove the `mainCharacter` span from the username `<p>`, add the `topCharacters` fetch alongside `games`, and add the new `<p>` after the rating line):

```tsx
async function PairedView({ userId, match }: { userId: string; match: Match }) {
  const opponent = match.player1Id === userId ? match.player2 : match.player1;

  if (match.status === "CONFIRMED" || match.status === "CANCELLED" || match.status === "EXPIRED") {
    return (
      <Card className="mt-4">
        {match.status === "CONFIRMED" ? (
          <ConfirmedSection userId={userId} match={match} opponentName={opponent.username} />
        ) : (
          <TerminatedSection status={match.status} />
        )}
        <CardContent className="border-t border-border pt-4">
          <Link
            href={`/players/${userId}`}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            View full match details on your profile →
          </Link>
        </CardContent>
      </Card>
    );
  }

  const games = await getMatchGames(match.id);
  const topCharacters = await getTopCharacters(opponent.id);
  const wins = { me: 0, opponent: 0 };
  for (const g of games) {
    if (g.winnerId === userId) wins.me++;
    else if (g.winnerId) wins.opponent++;
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <p className="badge-pop text-base font-semibold text-foreground">🎮 You&apos;ve been matched!</p>
          <Badge variant="secondary">{match.status.replace("_", " ").toLowerCase()}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        {opponent.avatarUrl && (
          <Image
            src={opponent.avatarUrl}
            alt={opponent.username}
            width={40}
            height={40}
            className="rounded-full"
          />
        )}
        <div>
          <p className="font-medium">{opponent.username}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{opponent.rating} rating</p>
          {topCharacters.length > 0 && (
            <p className="text-sm text-muted-foreground">Usually plays: {topCharacters.join(", ")}</p>
          )}
        </div>
        {games.length > 0 && (
          <Badge variant="outline" className="ml-auto tabular-nums">
            {wins.me}–{wins.opponent}
          </Badge>
        )}
      </CardContent>
```

(Everything below this point in `PairedView` — `RoomCodeForm` and onward — is unchanged.)

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (Typecheck will catch it if `opponent.mainCharacter` is still referenced anywhere, since the field was removed from the query in Step 1.)

- [ ] **Step 5: Run the full test suites**

Run: `npm test && npm run test:integration`
Expected: all pass (no test exercises `PairedView`'s JSX directly — this project doesn't have component tests for page-level server components — so this step is a regression check, not new coverage).

- [ ] **Step 6: Manual verification in the browser**

This project has no automated test harness for page components, so confirm the rendered line by hand against a real paired match. Local dev auth accepts any username via a credentials form when `NODE_ENV=development` and `AUTH_DISCORD_ID` is unset (`src/auth.ts`), so this is doable end-to-end without real Discord accounts.

Create a throwaway script at `/tmp/seed-paired-match.ts`:

```ts
import { prisma } from "../src/lib/db";
import { MatchStatus, LobbyEntryStatus } from "../src/generated/prisma/enums";

async function main() {
  const [me, opponent, thirdParty] = await Promise.all([
    prisma.user.upsert({
      where: { discordId: "dev-me" },
      update: {},
      create: { discordId: "dev-me", username: "Dev Me", rating: 1500, gamesPlayed: 0, region: "USA East", maxMatchDistanceKm: 5000 },
    }),
    prisma.user.upsert({
      where: { discordId: "dev-opponent" },
      update: {},
      create: { discordId: "dev-opponent", username: "Dev Opponent", rating: 1500, gamesPlayed: 0, region: "USA East", maxMatchDistanceKm: 5000 },
    }),
    prisma.user.upsert({
      where: { discordId: "dev-thirdparty" },
      update: {},
      create: { discordId: "dev-thirdparty", username: "Dev Third", rating: 1500, gamesPlayed: 0, region: "USA East", maxMatchDistanceKm: 5000 },
    }),
  ]);

  // A prior CONFIRMED match gives the opponent qualifying character history.
  const priorMatch = await prisma.ratingMatch.create({
    data: {
      player1Id: opponent.id,
      player2Id: thirdParty.id,
      status: MatchStatus.CONFIRMED,
      expiresAt: new Date(),
    },
  });
  await prisma.matchGame.create({
    data: {
      matchId: priorMatch.id,
      gameNumber: 1,
      actorAId: opponent.id,
      actorAStrikes: 1,
      actorACharacter: "Terry",
      actorBId: thirdParty.id,
      actorBStrikes: 2,
      winnerId: opponent.id,
    },
  });

  // The currently-active match shown in the lobby.
  const activeMatch = await prisma.ratingMatch.create({
    data: {
      player1Id: me.id,
      player2Id: opponent.id,
      status: MatchStatus.PENDING_REPORT,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  await prisma.ratingLobbyEntry.create({
    data: {
      userId: me.id,
      status: LobbyEntryStatus.PAIRED,
      matchId: activeMatch.id,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  console.log("Log in as username 'Dev Me' and visit /lobby.");
}

main().finally(() => prisma.$disconnect());
```

Run:
```bash
npx tsx /tmp/seed-paired-match.ts
npm run dev
```

Then in a browser: go to the sign-in page, use the dev credentials form with username `Dev Me`, visit `/lobby`.

Expected: the paired card shows "Dev Opponent", their rating, and directly under it `Usually plays: Terry` — with no `(mainCharacter)` text next to the username.

Delete `/tmp/seed-paired-match.ts` when done — it's throwaway, not part of the repo.

- [ ] **Step 7: Commit**

```bash
git add src/app/lobby/page.tsx src/lib/matches.ts
git commit -m "$(cat <<'EOF'
Show opponent's top played characters in the lobby, replacing mainCharacter

Renders "Usually plays: A, B, C" under the opponent's rating in the
active-match card, using getTopCharacters from confirmed match history.
Supersedes the inline self-declared mainCharacter text added in
f239f2d — only one, more accurate character line shows per opponent now.
EOF
)"
```
