import { SMASH_CHARACTERS } from "@/lib/characters";
import { MATCH_COUNTRIES } from "@/lib/regions";
import { getLeaderboardPlayers } from "@/lib/leaderboard";
import { CharacterIcon } from "@/components/character-icon";
import { RankBadge } from "@/components/rank-badge";
import { StreamRefreshPoller } from "@/components/stream-refresh-poller";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MEDALS = ["🥇", "🥈", "🥉"];

// Broadcast overlay meant to be captured directly by OBS as a Browser
// Source (see layout.tsx's isStreamOverlay branch for the chrome-less,
// transparent-background shell this renders inside). Functionality only —
// the actual visual design here is a placeholder for the design team to
// replace; nothing about the markup below should be treated as final.
//
// Query params: ?limit=10 (top N, capped at 50), ?character=Mario, and
// ?country=Canada (optional filters), matching /leaderboard's semantics.
export default async function StreamLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string; character?: string; country?: string }>;
}) {
  const { limit: limitParam, character, country } = await searchParams;
  const isValidCharacter = character && (SMASH_CHARACTERS as readonly string[]).includes(character);
  const isValidCountry = country && (MATCH_COUNTRIES as readonly string[]).includes(country);

  const requestedLimit = Number(limitParam);
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const { players } = await getLeaderboardPlayers(
    {
      character: isValidCharacter ? character : null,
      country: isValidCountry ? (country as (typeof MATCH_COUNTRIES)[number]) : null,
    },
    { take: limit },
  );

  return (
    <div className="p-4">
      <StreamRefreshPoller />
      <table className="w-full text-left text-sm">
        <tbody>
          {players.map((player, index) => (
            <tr key={player.id}>
              <td className="py-1 pr-2 tabular-nums text-muted-foreground">
                {MEDALS[index] ?? index + 1}
              </td>
              <td className="py-1 pr-2">
                <div className="flex items-center gap-2 font-medium">
                  {player.mainCharacter && <CharacterIcon name={player.mainCharacter} size={20} />}
                  {player.username}
                </div>
              </td>
              <td className="py-1 pr-2">
                <RankBadge rating={player.rating} gamesPlayed={player.gamesPlayed} />
              </td>
              <td className="py-1 text-right font-medium tabular-nums">{player.rating}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {players.length === 0 && <p className="text-sm text-muted-foreground">No ranked players yet.</p>}
    </div>
  );
}
