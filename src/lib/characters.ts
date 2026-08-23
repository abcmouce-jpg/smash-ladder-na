// Super Smash Bros. Ultimate's full fighter roster, including all DLC through
// Fighter Pass 2, plus "Random" tacked on at the end — not a real fighter,
// but a legitimate character-select pick (the "?" icon) that players can
// report/main just like any other entry. The site has no way to know which
// actual fighter the game's RNG landed on, so "Random" gets tracked as its
// own bucket rather than resolved to a real character.
export const SMASH_CHARACTERS = [
  "Mario",
  "Donkey Kong",
  "Link",
  "Samus",
  "Dark Samus",
  "Yoshi",
  "Kirby",
  "Fox",
  "Pikachu",
  "Luigi",
  "Ness",
  "Captain Falcon",
  "Jigglypuff",
  "Peach",
  "Daisy",
  "Bowser",
  "Ice Climbers",
  "Sheik",
  "Zelda",
  "Dr. Mario",
  "Pichu",
  "Falco",
  "Marth",
  "Lucina",
  "Young Link",
  "Ganondorf",
  "Mewtwo",
  "Roy",
  "Chrom",
  "Mr. Game & Watch",
  "Meta Knight",
  "Pit",
  "Dark Pit",
  "Zero Suit Samus",
  "Wario",
  "Snake",
  "Ike",
  "Pokémon Trainer",
  "Diddy Kong",
  "Lucas",
  "Sonic",
  "King Dedede",
  "Olimar",
  "Lucario",
  "R.O.B.",
  "Toon Link",
  "Wolf",
  "Villager",
  "Mega Man",
  "Wii Fit Trainer",
  "Rosalina & Luma",
  "Little Mac",
  "Greninja",
  "Mii Brawler",
  "Mii Swordfighter",
  "Mii Gunner",
  "Palutena",
  "Pac-Man",
  "Robin",
  "Shulk",
  "Bowser Jr.",
  "Duck Hunt",
  "Ryu",
  "Ken",
  "Cloud",
  "Corrin",
  "Bayonetta",
  "Inkling",
  "Ridley",
  "Simon",
  "Richter",
  "King K. Rool",
  "Isabelle",
  "Incineroar",
  "Piranha Plant",
  "Joker",
  "Hero",
  "Banjo & Kazooie",
  "Terry",
  "Byleth",
  "Min Min",
  "Steve",
  "Sephiroth",
  "Pyra/Mythra",
  "Kazuya",
  "Sora",
  "Random",
] as const;

export type SmashCharacter = (typeof SMASH_CHARACTERS)[number];

// Nintendo's official Echo Fighters — near-identical moveset to their base
// fighter, functionally the same character for matchup/usage purposes.
// Doesn't include semi-clones (Falco, Ganondorf, Dr. Mario, etc.) — those
// have real enough differences that lumping their stats together would be
// misleading, not just tidying. Marth/Lucina, Roy/Chrom, and Ryu/Ken are
// deliberately NOT grouped either, despite being official echoes —
// different enough in practice (and different enough in community
// perception) that merging their stats did more harm than good. First
// entry in each group is the canonical one stats/filters key off of; order
// otherwise doesn't matter.
export const ECHO_FIGHTER_GROUPS: readonly (readonly SmashCharacter[])[] = [
  ["Peach", "Daisy"],
  ["Samus", "Dark Samus"],
  ["Pit", "Dark Pit"],
  ["Simon", "Richter"],
] as const;

const ECHO_GROUP_BY_MEMBER = new Map<SmashCharacter, readonly SmashCharacter[]>(
  ECHO_FIGHTER_GROUPS.flatMap((group) => group.map((member) => [member, group] as const)),
);

// Every character in the same echo group as `character`, including itself —
// just `[character]` for anyone without an echo. Use this wherever a single
// character's stats/filtering should actually mean "this character or its
// echo(es)" (leaderboard filtering, character usage counts).
export function echoGroupMembers(character: SmashCharacter): readonly SmashCharacter[] {
  return ECHO_GROUP_BY_MEMBER.get(character) ?? [character];
}

// The group's first (canonical) member — same for every character in a
// group, so grouping/summing by this collapses echoes into one bucket.
export function echoGroupCanonical(character: SmashCharacter): SmashCharacter {
  return echoGroupMembers(character)[0];
}

// Human-readable label for a character's whole echo group, e.g. "Marth /
// Lucina" — falls back to just the name for anyone without an echo.
export function echoGroupLabel(character: SmashCharacter): string {
  return echoGroupMembers(character).join(" / ");
}

// The 3 Mii fighters — the only characters that take a user-entered
// moveset string (see MOVESET_PATTERN) alongside the pick itself.
export const MII_CHARACTERS: readonly SmashCharacter[] = [
  "Mii Brawler",
  "Mii Swordfighter",
  "Mii Gunner",
];

export function isMiiCharacter(character: string): boolean {
  return (MII_CHARACTERS as readonly string[]).includes(character);
}

// A Mii's custom moveset: 4 special moves, each customized to one of 4
// variants, entered as a 4-digit string like "1221".
export const MOVESET_PATTERN = /^[1-4]{4}$/;

// Caps how many characters a Free Battle post can self-tag with — keeps the
// (purely descriptive, unrestricted) tag list from becoming an unbounded
// free-text stand-in, and the post-form/filter trigger from overflowing.
// Same spirit as the block-list cap elsewhere in this codebase, just for a
// self-declared string array instead of a relation.
export const MAX_FREE_BATTLE_CHARACTERS = 5;
