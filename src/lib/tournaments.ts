import { after } from "next/server";
import { prisma } from "@/lib/db";
import { TournamentStatus } from "@/generated/prisma/enums";
import { sendDiscordDMsSequentially } from "@/lib/discord-bot";
import { normalizeStartggUrl } from "@/lib/startgg";
import { LocalizedError } from "@/lib/localized-error";

const entryWithUser = {
  user: { select: { id: true, username: true, avatarUrl: true, rating: true } },
} as const;

export async function listTournaments() {
  return prisma.tournament.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      host: { select: { id: true, username: true } },
      _count: { select: { entries: true } },
    },
  });
}

export async function getTournament(id: string) {
  return prisma.tournament.findUnique({
    where: { id },
    include: {
      host: { select: { id: true, username: true } },
      entries: { include: entryWithUser, orderBy: { joinedAt: "asc" } },
    },
  });
}

export async function createTournament(hostId: string, name: string, description: string, startggUrl: string) {
  const trimmedName = name.trim().slice(0, 100);
  if (!trimmedName)
    throw new LocalizedError({ en: "Name is required", es: "El nombre es obligatorio", ja: "名前を入力してください" });
  return prisma.tournament.create({
    data: {
      hostId,
      name: trimmedName,
      description: description.trim().slice(0, 1000) || null,
      startggUrl: normalizeStartggUrl(startggUrl),
    },
  });
}

async function requireHostOrMod(tournamentId: string, userId: string, role: "USER" | "MOD" | "ADMIN") {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament)
    throw new LocalizedError({ en: "Tournament not found", es: "Torneo no encontrado", ja: "大会が見つかりません" });
  if (tournament.hostId !== userId && role !== "MOD" && role !== "ADMIN") {
    throw new LocalizedError({
      en: "Only the host or a moderator can do that",
      es: "Solo el anfitrión o un moderador puede hacer eso",
      ja: "それができるのは主催者かモデレーターだけです",
    });
  }
  return tournament;
}

export async function joinTournament(userId: string, tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament)
    throw new LocalizedError({ en: "Tournament not found", es: "Torneo no encontrado", ja: "大会が見つかりません" });
  if (tournament.status !== TournamentStatus.SIGNUPS) {
    throw new LocalizedError({
      en: "Signups are closed for this tournament",
      es: "Las inscripciones de este torneo están cerradas",
      ja: "この大会の参加受付は終了しています",
    });
  }
  await prisma.tournamentEntry.upsert({
    where: { tournamentId_userId: { tournamentId, userId } },
    update: {},
    create: { tournamentId, userId },
  });
}

export async function leaveTournament(userId: string, tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament)
    throw new LocalizedError({ en: "Tournament not found", es: "Torneo no encontrado", ja: "大会が見つかりません" });
  if (tournament.status !== TournamentStatus.SIGNUPS) {
    throw new LocalizedError({
      en: "Can't leave after check-in has closed",
      es: "No puedes salir después de que cerró el check-in",
      ja: "受付終了後は参加を取り消せません",
    });
  }
  await prisma.tournamentEntry.deleteMany({ where: { tournamentId, userId } });
}

export async function setStartggUrl(userId: string, tournamentId: string, url: string, role: "USER" | "MOD" | "ADMIN") {
  await requireHostOrMod(tournamentId, userId, role);
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { startggUrl: normalizeStartggUrl(url) },
  });
}

// The bracket itself runs on start.gg — these just move our own lifecycle
// label along so the tournament list reads accurately.
export async function markInProgress(userId: string, tournamentId: string, role: "USER" | "MOD" | "ADMIN") {
  const tournament = await requireHostOrMod(tournamentId, userId, role);
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: TournamentStatus.IN_PROGRESS, startedAt: new Date() },
  });

  const entries = await prisma.tournamentEntry.findMany({
    where: { tournamentId },
    select: { user: { select: { discordId: true } } },
  });
  const message = tournament.startggUrl
    ? `🏆 **${tournament.name}** is starting! Bracket: ${tournament.startggUrl}`
    : `🏆 **${tournament.name}** is starting!`;
  const recipients = entries.map((e) => e.user);
  after(() => sendDiscordDMsSequentially(recipients, message));
}

export async function markCompleted(userId: string, tournamentId: string, role: "USER" | "MOD" | "ADMIN") {
  await requireHostOrMod(tournamentId, userId, role);
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: TournamentStatus.COMPLETED, completedAt: new Date() },
  });
}

export async function cancelTournament(userId: string, tournamentId: string, role: "USER" | "MOD" | "ADMIN") {
  await requireHostOrMod(tournamentId, userId, role);
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: TournamentStatus.CANCELLED },
  });
}
