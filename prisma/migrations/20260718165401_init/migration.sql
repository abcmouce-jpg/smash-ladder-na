-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MOD', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "LobbyEntryStatus" AS ENUM ('WAITING', 'PAIRED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PairingMethod" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING_REPORT', 'REPORTED', 'CONFIRMED', 'DISPUTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ConfirmationMethod" AS ENUM ('SELF_CONFIRMED', 'AUTO_TIMEOUT', 'ADMIN_RESOLVED');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('OPEN', 'MATCHED', 'CLOSED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "email" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 1500,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "cancelCount" INTEGER NOT NULL DEFAULT 0,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingLobbyEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "LobbyEntryStatus" NOT NULL DEFAULT 'WAITING',
    "pairingMethod" "PairingMethod" NOT NULL DEFAULT 'MANUAL',
    "pairedEntryId" TEXT,
    "matchId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "RatingLobbyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingMatch" (
    "id" TEXT NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT NOT NULL,
    "pairingMethod" "PairingMethod" NOT NULL DEFAULT 'MANUAL',
    "roomCode" TEXT,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING_REPORT',
    "reportedWinnerId" TEXT,
    "reportedById" TEXT,
    "reportedAt" TIMESTAMP(3),
    "secondReportWinnerId" TEXT,
    "secondReportById" TEXT,
    "secondReportAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmationMethod" "ConfirmationMethod",
    "disputeReason" TEXT,
    "player1RatingBefore" INTEGER,
    "player1RatingAfter" INTEGER,
    "player2RatingBefore" INTEGER,
    "player2RatingAfter" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatingMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "ratingBefore" INTEGER NOT NULL,
    "ratingAfter" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreeBattlePost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "region" TEXT,
    "status" "PostStatus" NOT NULL DEFAULT 'OPEN',
    "matchedWithId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "matchedAt" TIMESTAMP(3),

    CONSTRAINT "FreeBattlePost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_rating_idx" ON "User"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "RatingLobbyEntry_pairedEntryId_key" ON "RatingLobbyEntry"("pairedEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "RatingLobbyEntry_matchId_key" ON "RatingLobbyEntry"("matchId");

-- CreateIndex
CREATE INDEX "RatingLobbyEntry_status_expiresAt_idx" ON "RatingLobbyEntry"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "RatingMatch_status_idx" ON "RatingMatch"("status");

-- CreateIndex
CREATE INDEX "RatingMatch_player1Id_idx" ON "RatingMatch"("player1Id");

-- CreateIndex
CREATE INDEX "RatingMatch_player2Id_idx" ON "RatingMatch"("player2Id");

-- CreateIndex
CREATE INDEX "RatingHistory_userId_createdAt_idx" ON "RatingHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FreeBattlePost_status_createdAt_idx" ON "FreeBattlePost"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingLobbyEntry" ADD CONSTRAINT "RatingLobbyEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingLobbyEntry" ADD CONSTRAINT "RatingLobbyEntry_pairedEntryId_fkey" FOREIGN KEY ("pairedEntryId") REFERENCES "RatingLobbyEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingLobbyEntry" ADD CONSTRAINT "RatingLobbyEntry_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "RatingMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingMatch" ADD CONSTRAINT "RatingMatch_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingMatch" ADD CONSTRAINT "RatingMatch_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingHistory" ADD CONSTRAINT "RatingHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingHistory" ADD CONSTRAINT "RatingHistory_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "RatingMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeBattlePost" ADD CONSTRAINT "FreeBattlePost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
