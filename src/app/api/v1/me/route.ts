import { NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/api-tokens";
import { prisma } from "@/lib/db";
import { formatRating } from "@/lib/rating-format";
import { isRatingVisible } from "@/lib/rank-tier";

export async function GET(request: Request) {
  const userId = await resolveApiUser(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, rating: true, gamesPlayed: true, region: true },
  });
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A provisional player's rating isn't public yet (see isRatingVisible), and
  // that includes this endpoint — the token is the player's own, and the
  // player isn't a moderator. gamesPlayed is still returned so a caller can
  // tell why the rating is missing.
  const rating = isRatingVisible(me.gamesPlayed, false) ? formatRating(me.rating) : null;

  return NextResponse.json({ ...me, rating });
}
