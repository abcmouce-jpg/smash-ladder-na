-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mainCharacter" TEXT;

-- CreateTable
CREATE TABLE "CharacterVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "character" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CharacterVote_userId_key" ON "CharacterVote"("userId");

-- CreateIndex
CREATE INDEX "CharacterVote_character_idx" ON "CharacterVote"("character");

-- CreateIndex
CREATE INDEX "User_mainCharacter_idx" ON "User"("mainCharacter");

-- AddForeignKey
ALTER TABLE "CharacterVote" ADD CONSTRAINT "CharacterVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
