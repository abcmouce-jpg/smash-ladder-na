// TEMPORARY, ONE-OFF ADMIN TOOL — remove this file (and src/lib/admin-elo-fix.ts)
// once the shinymark/Who match has been corrected.
//
// GET  ?playerId=&ratingBefore=&ratingAfter=   -> locates the match, reports blast radius (read-only)
// POST { matchId, winnerId, dryRun }           -> recomputes; dryRun=true rolls back and returns the diff
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";
import { findAffectedChain, applyEloChainFix } from "@/lib/admin-elo-fix";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "ADMIN") throw new Error("Not authorized");
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const playerId = searchParams.get("playerId");
    const ratingBefore = Number(searchParams.get("ratingBefore"));
    const ratingAfter = Number(searchParams.get("ratingAfter"));
    if (!playerId) return NextResponse.json({ error: "playerId required" }, { status: 400 });

    const target = await prisma.ratingMatch.findFirst({
      where: {
        status: MatchStatus.CONFIRMED,
        OR: [
          { player1Id: playerId, player1RatingBefore: ratingBefore, player1RatingAfter: ratingAfter },
          { player2Id: playerId, player2RatingBefore: ratingBefore, player2RatingAfter: ratingAfter },
        ],
      },
      include: { player1: { select: { username: true } }, player2: { select: { username: true } } },
    });
    if (!target) return NextResponse.json({ error: "No matching match found" }, { status: 404 });

    const { matches } = await prisma.$transaction((tx) => findAffectedChain(tx, target.id));
    const players = await prisma.user.findMany({
      where: { id: { in: [...new Set(matches.flatMap((m) => [m.player1Id, m.player2Id]))] } },
      select: { id: true, username: true, rating: true },
    });
    const usernameById = new Map(players.map((p) => [p.id, p.username]));

    return NextResponse.json({
      target: {
        id: target.id,
        player1: target.player1.username,
        player2: target.player2.username,
        confirmedAt: target.confirmedAt,
        reportedWinnerId: target.reportedWinnerId,
      },
      matchCount: matches.length,
      players: players.map((p) => p.username),
      hasPracticeMatches: matches.some((m) => m.player1IsPracticing || m.player2IsPracticing),
      matches: matches.map((m) => ({
        id: m.id,
        confirmedAt: m.confirmedAt,
        p1: usernameById.get(m.player1Id),
        p1Before: m.player1RatingBefore,
        p1After: m.player1RatingAfter,
        p2: usernameById.get(m.player2Id),
        p2Before: m.player2RatingBefore,
        p2After: m.player2RatingAfter,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { matchId, winnerId, dryRun } = (await req.json()) as {
      matchId: string;
      winnerId: string;
      dryRun?: boolean;
    };
    if (!matchId || !winnerId) return NextResponse.json({ error: "matchId and winnerId required" }, { status: 400 });

    try {
      const result = await prisma.$transaction(async (tx) => {
        const fixResult = await applyEloChainFix(tx, matchId, winnerId);
        if (dryRun) throw new DryRunAbort(fixResult);
        return fixResult;
      });
      return NextResponse.json({ applied: true, ...result });
    } catch (err) {
      if (err instanceof DryRunAbort) return NextResponse.json({ applied: false, dryRun: true, ...err.payload });
      throw err;
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

class DryRunAbort extends Error {
  payload: Record<string, unknown>;
  constructor(payload: Record<string, unknown>) {
    super("dry run abort");
    this.payload = payload;
  }
}
