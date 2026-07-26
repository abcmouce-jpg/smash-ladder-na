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
- Icon-only, via the existing copyright-safe `CharacterIcon` component
  (`src/components/character-icon.tsx`) — no visible character name text,
  relying on the component's built-in `title` attribute for a native
  hover tooltip. This also touches the profile page in one small way: its
  existing `mainCharacter` icon (`src/app/players/[id]/page.tsx`) already
  used `CharacterIcon` next to the username, so the redundant `"· mains X"`
  visible text is removed from the paragraph below it, for consistency
  with the icon-only-plus-tooltip treatment. The `mainCharacter` field,
  its self-declared nature, and the icon placement/size next to the
  username are otherwise unchanged.
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
opponent and render a row of icons directly under the existing rating line:

```tsx
<p className="font-medium">{opponent.username}</p>
<p className="text-sm text-muted-foreground tabular-nums">{opponent.rating} rating</p>
{topCharacters.length > 0 && (
  <div className="mt-1 flex items-center gap-1.5">
    {topCharacters.map((character) => (
      <CharacterIcon key={character} name={character} size={20} />
    ))}
  </div>
)}
```

- `const topCharacters = await getTopCharacters(opponent.id);` added near the top
  of `PairedView` (already an `async` server component).
- If `topCharacters` is empty, the row is omitted entirely — no placeholder icon.
- No visible character-name text — `CharacterIcon` renders a native
  `title={name}` tooltip on hover, which is how a character's name is
  discovered. `CharacterIcon`'s image comes from a real official stock-icon
  asset when one is mapped (see "Real character icons" below), falling back
  to the original colored-initials badge only for an unmapped name.

## Testing

- Unit test `getTopCharacters` covering: no games → `[]`; single character;
  multiple characters ranked by count; tie broken alphabetically; excludes
  games from non-`CONFIRMED` matches; excludes games with null `winnerId`;
  respects `limit`.
- Manual check in the lobby UI: pair with an opponent who has confirmed match
  history across multiple characters and confirm the icon row renders with
  the right count and order, that hovering each icon shows the correct
  character name via the native tooltip, and with a fresh opponent (no
  history) confirm the row is omitted entirely.
- Manual check on the profile page: confirm the `"· mains X"` text is gone
  and the existing icon next to the username still shows a tooltip on hover.

## Resolved: character icons (was "future work"), then reversed to real art

Two decisions happened in sequence, both explicit and both worth keeping on
record:

1. **First pass**: icons were implemented using the existing copyright-safe
   `CharacterIcon` placeholder (colored, deterministic initials badge, no
   real game art) — already used on the leaderboard, characters, and
   players pages. No new assets needed at that point.
2. **Reversed immediately after**, by explicit request: swap in the real
   official stock-icon art that was researched and set aside earlier in
   this project (see the git history of this file for that research —
   source, coverage confirmation, and the licensing note about
   Nintendo/Bandai-Namco/HAL/Konami/Sega/Capcom/MonolithSoft/Atlus/
   Microsoft/Mojang copyright). This explicitly revisits and reverses the
   "not to be reconsidered without revisiting this decision explicitly"
   note from the first pass.

**What actually shipped:**

- Source: `~/Downloads/Super Smash Bros Ultimate/Stock Icons` (alt costume
  `00`, the default, per character). 86 files copied into
  `public/characters/<slug>.png`, where `<slug>` is Nintendo's internal
  codename (e.g. `gaogaen` = Incineroar), not the display name.
- New mapping table `CHARACTER_ICON_SLUGS` in `src/lib/character-icons.ts`,
  typed as `Record<SmashCharacter, string>` so the compiler enforces full
  roster coverage — every entry in `SMASH_CHARACTERS` must have a mapping,
  or `tsc` fails. `Pyra/Mythra` (one combined roster entry) maps to one
  representative icon (`eflame`, Pyra's).
- `CharacterIcon` (`src/components/character-icon.tsx`) now renders the
  mapped image via `next/image` when a slug exists, falling back to the
  original colored-initials rendering for any name without one (e.g. stale
  historical data that predates a roster rename) — same component name and
  props (`name`, `size`) as before, so no call site changed.
- Applied everywhere `CharacterIcon` is used: leaderboard, characters page,
  profile page, and this feature's lobby row — not lobby-only, so the app
  has one consistent icon treatment rather than two.
- Test: `src/lib/character-icons.test.ts` asserts every mapped slug's PNG
  file actually exists in `public/characters/` — the one thing the
  `Record<SmashCharacter, string>` type can't guarantee on its own, since
  it only enforces that every roster entry has *some* string mapped, not
  that a file backing that string exists on disk.

Context worth keeping around: a teammate previously tried adding
`CharacterIcon` to this same lobby card (`6a50031`) and reverted it
(`1ba3815`) before landing the plain-text `mainCharacter` version instead
(`f239f2d`, superseded above). The revert commit didn't explain why — this
implementation wasn't run past that teammate before rebuilding it, so if
icon-in-the-lobby-card causes a problem again, that revert is the first
place to look for what it might have been.

## Out of scope / explicitly not doing

- Showing this line for the current user's own side of the card.
- Adding a games-played count to the lobby card (profile page has it; lobby
  intentionally stays minimal here).
- Any change to the profile page's `mainCharacter` field itself, its
  self-declared nature, or its icon's placement/size next to the username —
  only the redundant "· mains X" text line was removed (see Scope).
