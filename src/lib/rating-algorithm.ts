import { RatingAlgorithm } from "@/generated/prisma/enums";

// How each algorithm is named in the admin tools. Only the enum lives in
// generated code, so this is the one place the three get written out — a new
// member is a compile error here rather than a season that renders as "Elo"
// because it isn't Glicko-2.
export const RATING_ALGORITHM_LABEL: Record<RatingAlgorithm, string> = {
  ELO: "Elo",
  GLICKO2: "Glicko-2",
  SMASHMATE: "Smashmate",
};

export const RATING_ALGORITHMS = Object.keys(RATING_ALGORITHM_LABEL) as RatingAlgorithm[];
