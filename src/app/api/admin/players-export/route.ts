import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// Reuses CRON_SECRET rather than adding a new env var — it already means
// "trusted non-interactive caller" for this project (see /api/cron/finalize),
// which is exactly what a scripted export needs. Interactive admins hit this
// with their normal session instead.
function isAuthorized(request: Request, role: string | undefined) {
  if (role === "MOD" || role === "ADMIN") return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function csvField(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Deliberately excludes discordId/email — nothing here that isn't already
// visible on public profile/leaderboard pages.
export async function GET(request: Request) {
  const session = await auth();
  if (!isAuthorized(request, session?.user?.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    orderBy: { rating: "desc" },
    select: {
      username: true,
      rating: true,
      gamesPlayed: true,
      region: true,
      mainCharacter: true,
      wiredConnection: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  const header = [
    "username",
    "rating",
    "gamesPlayed",
    "region",
    "mainCharacter",
    "wiredConnection",
    "role",
    "status",
    "joinedAt",
  ];
  const rows = users.map((u) =>
    [
      u.username,
      String(u.rating),
      String(u.gamesPlayed),
      u.region ?? "",
      u.mainCharacter ?? "",
      String(u.wiredConnection),
      u.role,
      u.status,
      u.createdAt.toISOString(),
    ]
      .map(csvField)
      .join(","),
  );

  const csv = [header.join(","), ...rows].join("\n") + "\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="smash-ladder-na-players.csv"',
    },
  });
}
