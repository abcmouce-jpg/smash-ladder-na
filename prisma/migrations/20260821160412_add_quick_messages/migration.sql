-- AlterTable
ALTER TABLE "User" ADD COLUMN     "quickMessages" TEXT[] DEFAULT ARRAY[]::TEXT[];
