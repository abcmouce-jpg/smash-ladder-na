import { NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/api-tokens";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const userId = await resolveApiUser(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, rating: true, gamesPlayed: true, region: true },
  });
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(me);
}
