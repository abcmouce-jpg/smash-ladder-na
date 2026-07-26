# Lobby opponent top-characters display

## Problem

When a player is matched with an opponent in the lobby (`/lobby`), the paired-match
card shows the opponent's username and rating, but nothing about which characters
they play. The profile page shows a "mains X" line, but that's a single
self-declared field (`User.mainCharacter`) — not computed from match history, and
can never show more than one character. This feature adds a lobby-only line
showing the opponent's most-played characters, computed from their actual game
history, so players can scout who they're about to face.

## Scope

- Applies only to the opponent's side of the active "you've been matched" card in
  `PairedView` (`src/app/lobby/page.tsx`). The current user's own side is untouched.
- Only shown while the match is active (the card rendered at `PairedView` lines
  334–361); the post-match confirmed/cancelled/expired view doesn't show rating
  either today, and is out of scope.
- Does not touch the profile page or `mainCharacter`.
- Text only for now — character icons are a future enhancement, not part of this
  spec (see "Future work: character icons" below for the decided direction).
- **Supersedes** a since-landed change on `main` (`f239f2d`, "Show the
  opponent's voted main character (as text) next to their name") that shows
  `opponent.mainCharacter` — the same single self-declared field described
  above — inline next to the username in this same card. This feature
  removes that inline text and the `mainCharacter` field it added to
  `matchWithPlayers` (`src/lib/matches.ts`), so only one, more accurate
  (computed-from-history) character line shows per opponent instead of two
  possibly-conflicting ones.

## Data source and aggregation

Character picks are recorded per game on `MatchGame` (`actorACharacter` /
`actorBCharacter`, keyed to whichever side — `actorAId` / `actorBId` — the player
was on for that game). There is no existing aggregation helper; this adds one.

New function `getTopCharacters(userId: string, limit = 3)` in `src/lib/players.ts`,
alongside the existing `getTopRivals` (same shape of pattern: fetch raw rows,
tally in a `Map`, sort, slice — no raw SQL needed):

```ts
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

**Inclusion rule:** only games belonging to a `RatingMatch` with
`status: CONFIRMED`, and only games with a non-null `winnerId` (excludes
disputed/void games) — matches the existing `tallySetWins` convention in
`src/lib/match-games.ts`.

**Ranking:** by descending game count; ties broken alphabetically by character
name for determinism.

**Result size:** up to `limit` (default 3) entries; fewer if the opponent hasn't
played that many distinct characters; empty array if they have no qualifying
games (e.g., no confirmed matches yet).

## UI

In `PairedView` (`src/app/lobby/page.tsx`), fetch `topCharacters` for the
opponent and render a line directly under the existing rating line:

```tsx
<p className="font-medium">{opponent.username}</p>
<p className="text-sm text-muted-foreground tabular-nums">{opponent.rating} rating</p>
{topCharacters.length > 0 && (
  <p className="text-sm text-muted-foreground">
    Usually plays: {topCharacters.join(", ")}
  </p>
)}
```

- `const topCharacters = await getTopCharacters(opponent.id);` added near the top
  of `PairedView` (already an `async` server component).
- If `topCharacters` is empty, the line is omitted entirely — no placeholder text.
- Format is fixed as `"Usually plays: A, B, C"` (comma-separated, most-played
  first), regardless of whether there's 1, 2, or 3 characters.

## Testing

- Unit test `getTopCharacters` covering: no games → `[]`; single character;
  multiple characters ranked by count; tie broken alphabetically; excludes
  games from non-`CONFIRMED` matches; excludes games with null `winnerId`;
  respects `limit`.
- Manual check in the lobby UI: pair with an opponent who has confirmed match
  history across multiple characters and confirm the line renders correctly,
  and with a fresh opponent (no history) and confirm the line is omitted.

## Future work: character icons

Not part of this spec. Superseded from an earlier draft of this note: real
official game-art icon sources (PNG/SVG rips of in-game assets) were
researched and rejected in favor of the project's existing convention.

- **Direction**: `src/components/character-icon.tsx` already exists — a
  deliberately **copyright-safe** placeholder (a colored, deterministic
  initials badge, no real game art) already used on the leaderboard,
  characters, and players pages. Future icon work for this lobby feature
  should render `<CharacterIcon name={character} />` for each entry in
  `topCharacters`, not source new character art. This matches the
  project's established policy rather than introducing a second, real-art
  icon convention alongside it.
- **Context**: a teammate already tried adding `CharacterIcon` to this same
  lobby card (`6a50031`) and reverted it (`1ba3815`) before landing the
  plain-text `mainCharacter` version instead (`f239f2d`, superseded above).
  The revert commit doesn't explain why — worth checking with them before
  picking this back up, in case there was a concrete problem (layout,
  performance, visual noise) rather than just a change of direction.
- Real official game-art icons (the previously-researched PNG stock-icon
  source) are not part of this project's direction — not needed, and not
  to be reconsidered without revisiting this decision explicitly.

## Out of scope / explicitly not doing

- Character icons beyond the future-work note above.
- Showing this line for the current user's own side of the card.
- Adding a games-played count to the lobby card (profile page has it; lobby
  intentionally stays minimal here).
- Any change to the profile page's existing `mainCharacter` display.
