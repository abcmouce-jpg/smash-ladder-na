"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { upsertMatchupNote } from "@/lib/matchup-notes";
import {
  createCharacterGuide,
  deleteCharacterGuide,
  flagGuide,
  updateCharacterGuide,
  voteOnGuide,
} from "@/lib/character-guides";
import { prisma } from "@/lib/db";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

export type UpdateMatchupNoteState = { error: string | null };

export async function updateMatchupNoteAction(
  character: string,
  _prevState: UpdateMatchupNoteState,
  formData: FormData,
): Promise<UpdateMatchupNoteState> {
  const userId = await requireUserId();
  try {
    await upsertMatchupNote(userId, character, String(formData.get("note") ?? ""));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath("/notes");
  revalidatePath("/lobby");
  return { error: null };
}

export type GuideFormState = { error: string | null };

export async function createGuideAction(
  character: string,
  _prevState: GuideFormState,
  formData: FormData,
): Promise<GuideFormState> {
  const userId = await requireUserId();
  try {
    await createCharacterGuide(userId, character, String(formData.get("content") ?? ""));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath("/notes");
  return { error: null };
}

export async function editGuideAction(
  guideId: string,
  _prevState: GuideFormState,
  formData: FormData,
): Promise<GuideFormState> {
  const userId = await requireUserId();
  try {
    await updateCharacterGuide(userId, guideId, String(formData.get("content") ?? ""));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath("/notes");
  return { error: null };
}

export async function deleteGuideAction(guideId: string) {
  const userId = await requireUserId();
  await deleteCharacterGuide(userId, guideId);
  revalidatePath("/notes");
}

export async function voteOnGuideAction(guideId: string, value: 1 | -1) {
  const userId = await requireUserId();
  await voteOnGuide(userId, guideId, value);
  revalidatePath("/notes");
}

export async function flagGuideAction(guideId: string) {
  const userId = await requireUserId();
  await flagGuide(userId, guideId);
  revalidatePath("/notes");
}

// Overwrites the caller's private note for the guide's character — the
// confirm-before-overwrite prompt is the client's job (matchup-notes-list.tsx),
// this just does the copy once confirmed.
export async function importGuideAction(guideId: string) {
  const userId = await requireUserId();
  const guide = await prisma.characterGuide.findUnique({ where: { id: guideId } });
  if (!guide || guide.hiddenAt) throw new Error("Guide not found");
  await upsertMatchupNote(userId, guide.character, guide.content);
  revalidatePath("/notes");
  revalidatePath("/lobby");
}
