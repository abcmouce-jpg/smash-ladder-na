"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  cancelTournament,
  createTournament,
  joinTournament,
  leaveTournament,
  markCompleted,
  markInProgress,
  setStartggUrl,
} from "@/lib/tournaments";
import { requireActiveUser } from "@/lib/account";

async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return { userId: session.user.id, role: session.user.role };
}

export async function createTournamentAction(
  name: string,
  description: string,
  startggUrl: string,
) {
  const { userId } = await requireSession();
  await requireActiveUser(userId);
  const tournament = await createTournament(userId, name, description, startggUrl);
  revalidatePath("/tournaments");
  return tournament.id;
}

export async function joinTournamentAction(tournamentId: string) {
  const { userId } = await requireSession();
  await requireActiveUser(userId);
  await joinTournament(userId, tournamentId);
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function leaveTournamentAction(tournamentId: string) {
  const { userId } = await requireSession();
  await leaveTournament(userId, tournamentId);
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function setStartggUrlAction(tournamentId: string, url: string) {
  const { userId, role } = await requireSession();
  await setStartggUrl(userId, tournamentId, url, role);
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function markInProgressAction(tournamentId: string) {
  const { userId, role } = await requireSession();
  await markInProgress(userId, tournamentId, role);
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function markCompletedAction(tournamentId: string) {
  const { userId, role } = await requireSession();
  await markCompleted(userId, tournamentId, role);
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function cancelTournamentAction(tournamentId: string) {
  const { userId, role } = await requireSession();
  await cancelTournament(userId, tournamentId, role);
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath("/tournaments");
}
