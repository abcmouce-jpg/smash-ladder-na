
-- CreateTable
CREATE TABLE "CharacterGuideSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "character" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterGuideSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CharacterGuideSubscription_userId_character_key" ON "CharacterGuideSubscription"("userId", "character");

-- AddForeignKey
ALTER TABLE "CharacterGuideSubscription" ADD CONSTRAINT "CharacterGuideSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

