"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

export type CreateTournamentState = { error: string | null };

// (prevState, formData) shape so useActionState can drive it — a plain
// thrown error (e.g. pasting a non-start.gg link) would otherwise crash to
// Next's generic error overlay instead of showing an inline message.
export async function createTournamentAction(
  _prevState: CreateTournamentState,
  formData: FormData,
): Promise<CreateTournamentState> {
  const { userId } = await requireSession();
  await requireActiveUser(userId);

  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const startggUrl = String(formData.get("startggUrl") ?? "");

  let tournamentId: string;
  try {
    const tournament = await createTournament(userId, name, description, startggUrl);
    tournamentId = tournament.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }

  revalidatePath("/tournaments");
  redirect(`/tournaments/${tournamentId}`);
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

export type StartggUrlState = { error: string | null };

export async function setStartggUrlAction(
  tournamentId: string,
  _prevState: StartggUrlState,
  formData: FormData,
): Promise<StartggUrlState> {
  const { userId, role } = await requireSession();
  try {
    await setStartggUrl(userId, tournamentId, String(formData.get("startggUrl") ?? ""), role);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath(`/tournaments/${tournamentId}`);
  return { error: null };
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
