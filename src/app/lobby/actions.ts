"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { cancelLobbyEntry, joinLobbyAndTryPair, setMatchRoomCode } from "@/lib/lobby";
import { reportMatchResult } from "@/lib/matches";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

export async function joinLobby() {
  const userId = await requireUserId();
  await joinLobbyAndTryPair(userId);
  revalidatePath("/lobby");
}

export async function cancelLobby() {
  const userId = await requireUserId();
  await cancelLobbyEntry(userId);
  revalidatePath("/lobby");
}

export async function submitRoomCode(matchId: string, roomCode: string) {
  const userId = await requireUserId();
  await setMatchRoomCode(userId, matchId, roomCode.trim());
  revalidatePath("/lobby");
}

export async function reportResult(matchId: string, won: boolean) {
  const userId = await requireUserId();
  await reportMatchResult(matchId, userId, won);
  revalidatePath("/lobby");
}
