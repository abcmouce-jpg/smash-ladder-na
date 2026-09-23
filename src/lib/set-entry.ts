import type { MatchFeedEntry } from "@/lib/match-feed";

// Dates can't cross the server→client boundary, so match-feed entries are
// serialized before being handed to the client rows, player, and thumbnails.
export type SerializedSetEntry = Omit<MatchFeedEntry, "createdAt" | "confirmedAt"> & {
  createdAt: string;
  confirmedAt: string | null;
};

export type FeedPlayer = SerializedSetEntry["player1"];

export function serializeSetEntry(entry: MatchFeedEntry): SerializedSetEntry {
  return {
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    confirmedAt: entry.confirmedAt?.toISOString() ?? null,
  };
}

export const STATUS_LABEL: Record<string, { en: string; es: string }> = {
  PENDING_REPORT: { en: "In progress", es: "En curso" },
  REPORTED: { en: "In progress", es: "En curso" },
  DISPUTED: { en: "Disputed", es: "En disputa" },
  CONFIRMED: { en: "Final", es: "Final" },
  CANCELLED: { en: "Cancelled", es: "Cancelada" },
  EXPIRED: { en: "Expired", es: "Expirada" },
};

export const STATUS_VARIANT: Record<string, "success" | "warning" | "outline"> = {
  PENDING_REPORT: "success",
  REPORTED: "success",
  DISPUTED: "warning",
  CONFIRMED: "outline",
  CANCELLED: "outline",
  EXPIRED: "outline",
};

// The feed's own notion of a set that's still being played — the same pair
// getMatchFeed counts as in-progress. REPORTED is legacy (nothing writes it
// anymore) but old rows can still carry it. Everything else — CONFIRMED,
// CANCELLED, EXPIRED, and the legacy DISPUTED — is a set that isn't moving
// any more.
export function isSetLive(status: string) {
  return status === "PENDING_REPORT" || status === "REPORTED";
}

export type UnfinishedGame = { gameNumber: number; inProgress: boolean };

// The set's game with no decided winner yet, if there is one — the game the
// expandable row's running-clock line is about. A null winnerId alone does
// NOT mean "in progress": a set can end with that game still open. A
// surrender (surrenderMatch) and a no-response forfeit
// (closeOutUnansweredLead) both confirm the set without recording a winner on
// the game that was in flight, and a plain cancel or expiry just leaves the
// row untouched — so the game only counts as in progress while the SET is
// still live, and otherwise it reads as one that never finished.
export function getUnfinishedGame(entry: {
  status: string;
  games: readonly { gameNumber: number; winnerId: string | null }[];
}): UnfinishedGame | null {
  const game = entry.games.find((g) => g.winnerId === null);
  if (!game) return null;
  return { gameNumber: game.gameNumber, inProgress: isSetLive(entry.status) };
}
