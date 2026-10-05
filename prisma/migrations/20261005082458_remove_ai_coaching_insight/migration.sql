/*
  Warnings:

  - You are about to drop the column `aiInsightBody` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `aiInsightGeneratedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `aiInsightSignature` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "aiInsightBody",
DROP COLUMN "aiInsightGeneratedAt",
DROP COLUMN "aiInsightSignature";
