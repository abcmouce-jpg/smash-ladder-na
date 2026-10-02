-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notificationsDisabled" TEXT[] DEFAULT ARRAY[]::TEXT[];
