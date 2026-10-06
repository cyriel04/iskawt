/*
  Warnings:

  - The values [SENT] on the enum `InquiryStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `internalNote` on the `Inquiry` table. All the data in the column will be lost.
  - You are about to drop the column `message` on the `Inquiry` table. All the data in the column will be lost.
  - You are about to drop the column `requesterEmail` on the `Inquiry` table. All the data in the column will be lost.
  - You are about to drop the column `requesterPhone` on the `Inquiry` table. All the data in the column will be lost.
  - You are about to drop the column `respondedAt` on the `Inquiry` table. All the data in the column will be lost.
  - You are about to drop the column `sentAt` on the `Inquiry` table. All the data in the column will be lost.
  - Added the required column `renterId` to the `Inquiry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Inquiry` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "InquiryStatus_new" AS ENUM ('NEW', 'RESPONDED', 'DECLINED', 'CLOSED');
ALTER TABLE "public"."Inquiry" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Inquiry" ALTER COLUMN "status" TYPE "InquiryStatus_new" USING ("status"::text::"InquiryStatus_new");
ALTER TYPE "InquiryStatus" RENAME TO "InquiryStatus_old";
ALTER TYPE "InquiryStatus_new" RENAME TO "InquiryStatus";
DROP TYPE "public"."InquiryStatus_old";
ALTER TABLE "Inquiry" ALTER COLUMN "status" SET DEFAULT 'NEW';
COMMIT;

-- DropIndex
DROP INDEX "Inquiry_spaceId_createdAt_idx";

-- AlterTable
ALTER TABLE "Inquiry" DROP COLUMN "internalNote",
DROP COLUMN "message",
DROP COLUMN "requesterEmail",
DROP COLUMN "requesterPhone",
DROP COLUMN "respondedAt",
DROP COLUMN "sentAt",
ADD COLUMN     "hostLastReadAt" TIMESTAMP(3),
ADD COLUMN     "hostNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "renterId" TEXT NOT NULL,
ADD COLUMN     "renterLastReadAt" TIMESTAMP(3),
ADD COLUMN     "renterNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "shootDate" SET DATA TYPE DATE;

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Message_inquiryId_createdAt_idx" ON "Message"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_createdAt_idx" ON "Message"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "Inquiry_spaceId_renterId_status_idx" ON "Inquiry"("spaceId", "renterId", "status");

-- CreateIndex
CREATE INDEX "Inquiry_renterId_lastMessageAt_idx" ON "Inquiry"("renterId", "lastMessageAt");

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
