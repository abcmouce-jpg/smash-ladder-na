import { prisma } from "@/lib/db";
import { TournamentStatus } from "@/generated/prisma/enums";
import { sendDiscordDM } from "@/lib/discord-bot";

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

function normalizeStartggUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!/^https:\/\/(www\.)?start\.gg\//.test(trimmed)) {
    throw new Error("That doesn't look like a start.gg link");
  }
  return trimmed;
}

export async function createTournament(
  hostId: string,
  name: string,
  description: string,
  startggUrl: string,
) {
  const trimmedName = name.trim().slice(0, 100);
  if (!trimmedName) throw new Error("Name is required");
  return prisma.tournament.create({
    data: {
      hostId,
      name: trimmedName,
      description: description.trim().slice(0, 1000) || null,
      startggUrl: normalizeStartggUrl(startggUrl),
    },
  });
}

async function requireHostOrMod(
  tournamentId: string,
  userId: string,
  role: "USER" | "MOD" | "ADMIN",
) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new Error("Tournament not found");
  if (tournament.hostId !== userId && role !== "MOD" && role !== "ADMIN") {
    throw new Error("Only the host or a moderator can do that");
  }
  return tournament;
}

export async function joinTournament(userId: string, tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new Error("Tournament not found");
  if (tournament.status !== TournamentStatus.SIGNUPS) {
    throw new Error("Signups are closed for this tournament");
  }
  await prisma.tournamentEntry.upsert({
    where: { tournamentId_userId: { tournamentId, userId } },
    update: {},
    create: { tournamentId, userId },
  });
}

export async function leaveTournament(userId: string, tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new Error("Tournament not found");
  if (tournament.status !== TournamentStatus.SIGNUPS) {
    throw new Error("Can't leave after check-in has closed");
  }
  await prisma.tournamentEntry.deleteMany({ where: { tournamentId, userId } });
}

export async function setStartggUrl(
  userId: string,
  tournamentId: string,
  url: string,
  role: "USER" | "MOD" | "ADMIN",
) {
  await requireHostOrMod(tournamentId, userId, role);
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { startggUrl: normalizeStartggUrl(url) },
  });
}

// The bracket itself runs on start.gg — these just move our own lifecycle
// label along so the tournament list reads accurately.
export async function markInProgress(
  userId: string,
  tournamentId: string,
  role: "USER" | "MOD" | "ADMIN",
) {
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
  await Promise.all(entries.map((e) => sendDiscordDM(e.user.discordId, message)));
}

export async function markCompleted(
  userId: string,
  tournamentId: string,
  role: "USER" | "MOD" | "ADMIN",
) {
  await requireHostOrMod(tournamentId, userId, role);
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: TournamentStatus.COMPLETED, completedAt: new Date() },
  });
}

export async function cancelTournament(
  userId: string,
  tournamentId: string,
  role: "USER" | "MOD" | "ADMIN",
) {
  await requireHostOrMod(tournamentId, userId, role);
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: TournamentStatus.CANCELLED },
  });
}
