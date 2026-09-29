/*
  Warnings:

  - A unique constraint covering the columns `[contactEmail]` on the table `Host` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Host_contactEmail_key" ON "Host"("contactEmail");
