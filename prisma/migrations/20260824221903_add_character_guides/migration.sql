-- CreateTable
CREATE TABLE "CharacterGuide" (
    "id" TEXT NOT NULL,
    "character" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "flagCount" INTEGER NOT NULL DEFAULT 0,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterGuideVote" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterGuideVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterGuideFlag" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterGuideFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterGuide_character_hiddenAt_score_idx" ON "CharacterGuide"("character", "hiddenAt", "score");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterGuideVote_guideId_userId_key" ON "CharacterGuideVote"("guideId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterGuideFlag_guideId_userId_key" ON "CharacterGuideFlag"("guideId", "userId");

-- AddForeignKey
ALTER TABLE "CharacterGuide" ADD CONSTRAINT "CharacterGuide_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterGuideVote" ADD CONSTRAINT "CharacterGuideVote_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "CharacterGuide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterGuideVote" ADD CONSTRAINT "CharacterGuideVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterGuideFlag" ADD CONSTRAINT "CharacterGuideFlag_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "CharacterGuide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterGuideFlag" ADD CONSTRAINT "CharacterGuideFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
