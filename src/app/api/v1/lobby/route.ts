import { NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/api-tokens";
import { getActiveLobbyEntry, joinLobbyAndTryPair, cancelLobbyEntry, ROOM_CODE_PATTERN } from "@/lib/lobby";

export async function GET(request: Request) {
  const userId = await resolveApiUser(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entry = await getActiveLobbyEntry(userId);
  return NextResponse.json({ entry });
}

// Joins the queue, or hands back the existing entry if already queued/paired
// — same "not an error to call twice" behavior joinLobbyAndTryPair already
// has for the web UI (see its own comments on the race it handles).
export async function POST(request: Request) {
  const userId = await resolveApiUser(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const isPracticing = body?.isPracticing === true;
  const roomCode = typeof body?.roomCode === "string" ? body.roomCode : null;
  if (roomCode && !ROOM_CODE_PATTERN.test(roomCode)) {
    return NextResponse.json({ error: "Room code must be exactly 5 characters (A-Z or 0-9)" }, { status: 400 });
  }

  try {
    const entry = await joinLobbyAndTryPair(userId, isPracticing, roomCode);
    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const userId = await resolveApiUser(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await cancelLobbyEntry(userId);
  return NextResponse.json({ ok: true });
}
