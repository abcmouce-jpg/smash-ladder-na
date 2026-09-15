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
