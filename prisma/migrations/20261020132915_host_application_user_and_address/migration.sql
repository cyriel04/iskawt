/*
  Warnings:

  - Added the required column `address` to the `HostApplication` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `HostApplication` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "HostApplication" ADD COLUMN     "address" TEXT NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "HostApplication_userId_createdAt_idx" ON "HostApplication"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "HostApplication" ADD CONSTRAINT "HostApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
