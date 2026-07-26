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
  spec (see "Future work: character icons" below for the decided asset source).

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

Not part of this spec, but the asset source is decided so the follow-up work
isn't blocked later:

- **Source**: `~/Downloads/Super Smash Bros Ultimate/Stock Icons` — official
  in-game stock icons ripped from the game files (credited in that folder's
  `Tag.txt` to The Spriters Resource / "Random Talking Bush"; copyright spans
  Nintendo, Bandai-Namco, HAL, Konami, Sega, Capcom, MonolithSoft, Atlus,
  Microsoft, Mojang). PNG, 64×64 with alpha, ~7-8KB each. Ignore the sibling
  `No Gamma Fix` subfolder — same filenames, different color processing
  (different pixel data) — the top-level folder is the one to use.
- **Naming**: files are `chara_2_<internal-codename>_<alt 00-07>.png`, where
  the codename is Nintendo's internal name, not the display name (e.g.
  `gaogaen` = Incineroar, `jack` = Joker, `brave` = Hero, `buddy` = Banjo &
  Kazooie, `dolly` = Terry, `master` = Byleth, `tantan` = Min Min, `pickel` =
  Steve, `edge` = Sephiroth, `eflame`/`elight` = Pyra/Mythra, `demon` =
  Kazuya, `trail` = Sora). Confirmed full coverage of every entry in
  `SMASH_CHARACTERS` (`src/lib/characters.ts`), including all Fighter Pass 1
  and 2 characters — Pyra and Mythra each get their own icon (`eflame` /
  `elight`), better than falling back to one shared icon. Mii
  Fighter/Swordfighter/Gunner each have exactly 1 icon (no alt colors — Mii
  costumes aren't fixed palettes like other fighters).
- **What ships now vs. later**: only the alt `00` (default costume) PNG per
  character gets copied into the repo, at `public/characters/<slug>_00.png`
  (following the existing `public/smash-icon.webp` convention) — roughly 90
  files, well under 1MB. The remaining 7 alts per character (~630 files, a
  few MB) are deliberately left out of the repo until the alt-picker work
  below is actually built, so unused assets don't accumulate in the meantime.
- **Needed before use**: a static codename → display-name mapping table
  (covering all ~90 slugs, including the three `ptrainer` sub-pokémon
  variants) so `getTopCharacters`'s output (`SMASH_CHARACTERS` display names)
  can resolve to the right file.
- **Later, separate feature**: let a user pick which of the 8 alt costumes
  represents their declared main on their profile; the lobby icon (and any
  other icon usage) would render that chosen alt instead of always `00`.
  This requires the full 8-alt set to be present, storing a per-user alt
  choice, and a profile UI to pick it — out of scope for now.

## Out of scope / explicitly not doing

- Character icons beyond the future-work note above.
- Showing this line for the current user's own side of the card.
- Adding a games-played count to the lobby card (profile page has it; lobby
  intentionally stays minimal here).
- Any change to the profile page's existing `mainCharacter` display.
