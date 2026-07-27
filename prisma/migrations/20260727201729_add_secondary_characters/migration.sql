-- AlterTable
ALTER TABLE "User" ADD COLUMN     "secondaryCharacters" TEXT[] DEFAULT ARRAY[]::TEXT[];
