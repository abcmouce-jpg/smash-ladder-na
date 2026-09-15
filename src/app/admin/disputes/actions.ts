"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { adminCancelMatch, resolveDisputedGame } from "@/lib/disputes";
import { resolveMatchCorrection } from "@/lib/matches";
import { sendDiscordDM } from "@/lib/discord-bot";
import { prisma } from "@/lib/db";

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
}

export async function resolveDispute(matchId: string, gameNumber: number, winnerId: string) {
  await requireModerator();
  await resolveDisputedGame(matchId, gameNumber, winnerId);
  revalidatePath("/admin/disputes");
  revalidatePath("/lobby");
}

export async function cancelDispute(matchId: string) {
  await requireModerator();
  await adminCancelMatch(matchId);
  revalidatePath("/admin/disputes");
  revalidatePath("/lobby");
}

export async function resolveCorrection(matchId: string, winnerId: string) {
  await requireModerator();
  await resolveMatchCorrection(matchId, winnerId);
  revalidatePath("/admin/disputes");
  revalidatePath("/lobby");
}

export async function messageDisputedPlayer(playerId: string, formData: FormData) {
  await requireModerator();
  const message = String(formData.get("message") ?? "").trim();
  if (!message) throw new Error("Message can't be empty");

  const player = await prisma.user.findUnique({ where: { id: playerId }, select: { discordId: true } });
  if (!player) throw new Error("Player not found");

  await sendDiscordDM(
    player.discordId,
    `📨 A Smash Ladder NA mod sent you a message about your disputed match:\n\n${message}`,
  );
  revalidatePath("/admin/disputes");
}
