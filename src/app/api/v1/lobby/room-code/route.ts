import { NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/api-tokens";
import { updateLobbyRoomCode } from "@/lib/lobby";

export async function PATCH(request: Request) {
  const userId = await resolveApiUser(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const roomCode = typeof body?.roomCode === "string" ? body.roomCode : null;

  try {
    await updateLobbyRoomCode(userId, roomCode);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong" }, { status: 400 });
  }
}
