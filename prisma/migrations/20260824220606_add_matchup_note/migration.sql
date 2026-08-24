-- CreateTable
CREATE TABLE "MatchupNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "character" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchupNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchupNote_userId_character_key" ON "MatchupNote"("userId", "character");

-- AddForeignKey
ALTER TABLE "MatchupNote" ADD CONSTRAINT "MatchupNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
