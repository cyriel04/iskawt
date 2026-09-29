-- CreateEnum
CREATE TYPE "City" AS ENUM ('CALOOCAN', 'LAS_PINAS', 'MAKATI', 'MALABON', 'MANDALUYONG', 'MANILA', 'MARIKINA', 'MUNTINLUPA', 'NAVOTAS', 'PARANAQUE', 'PASAY', 'PASIG', 'PATEROS', 'QUEZON_CITY', 'SAN_JUAN', 'TAGUIG', 'VALENZUELA');

-- CreateEnum
CREATE TYPE "SpaceType" AS ENUM ('APARTMENT', 'HOUSE', 'STUDIO', 'OFFICE', 'COWORKING', 'WAREHOUSE', 'RETAIL', 'CAFE', 'RESTAURANT', 'BAR', 'ROOFTOP', 'GARDEN', 'POOL', 'EVENT_SPACE', 'GYM', 'OTHER');

-- CreateEnum
CREATE TYPE "Setting" AS ENUM ('INDOOR', 'OUTDOOR', 'BOTH');

-- CreateEnum
CREATE TYPE "NaturalLight" AS ENUM ('ABUNDANT', 'MODERATE', 'MINIMAL', 'NONE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PowerAccess" AS ENUM ('ON_SITE', 'LIMITED', 'GENERATOR_REQUIRED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Level" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SpaceStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'SENT', 'RESPONDED', 'DECLINED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProductionType" AS ENUM ('FILM', 'TV', 'MUSIC_VIDEO', 'COMMERCIAL', 'DOCUMENTARY', 'PHOTOSHOOT', 'EVENT');

-- CreateTable
CREATE TABLE "Host" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "about" TEXT,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "respondsInHours" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Host_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "city" "City" NOT NULL,
    "areaName" TEXT NOT NULL,
    "barangay" TEXT,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "exactAddress" TEXT,
    "type" "SpaceType" NOT NULL,
    "setting" "Setting" NOT NULL,
    "floorAreaSqm" INTEGER,
    "ceilingHeightM" DECIMAL(4,2),
    "maxCrew" INTEGER,
    "hourlyRate" INTEGER,
    "halfDayRate" INTEGER,
    "fullDayRate" INTEGER,
    "minimumHours" INTEGER,
    "rateNotes" TEXT,
    "naturalLight" "NaturalLight" NOT NULL DEFAULT 'UNKNOWN',
    "windowDirection" TEXT,
    "powerOutlets" INTEGER,
    "powerAccess" "PowerAccess" NOT NULL DEFAULT 'UNKNOWN',
    "blackoutCapable" BOOLEAN NOT NULL DEFAULT false,
    "noiseLevel" "Level",
    "soundproofed" BOOLEAN NOT NULL DEFAULT false,
    "hasWifi" BOOLEAN NOT NULL DEFAULT false,
    "hasElevator" BOOLEAN NOT NULL DEFAULT false,
    "parkingSpaces" INTEGER,
    "restrooms" INTEGER,
    "loadInNotes" TEXT,
    "accessNotes" TEXT,
    "houseRules" TEXT,
    "availabilityNotes" TEXT,
    "status" "SpaceStatus" NOT NULL DEFAULT 'DRAFT',
    "verifiedAt" TIMESTAMP(3),
    "listedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requesterPhone" TEXT,
    "requesterCompany" TEXT,
    "shootDate" TIMESTAMP(3),
    "durationHours" INTEGER,
    "crewSize" INTEGER,
    "productionType" "ProductionType" NOT NULL DEFAULT 'FILM',
    "message" TEXT NOT NULL,
    "budgetNote" TEXT,
    "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostApplication" (
    "id" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "notes" TEXT,
    "applicantName" TEXT NOT NULL,
    "applicantEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "HostApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilmCredit" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "productionType" "ProductionType" NOT NULL DEFAULT 'FILM',
    "sourceUrl" TEXT,

    CONSTRAINT "FilmCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SpaceToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SpaceToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Host_verifiedAt_idx" ON "Host"("verifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Space_slug_key" ON "Space"("slug");

-- CreateIndex
CREATE INDEX "Space_city_status_idx" ON "Space"("city", "status");

-- CreateIndex
CREATE INDEX "Space_type_status_idx" ON "Space"("type", "status");

-- CreateIndex
CREATE INDEX "Space_status_listedAt_idx" ON "Space"("status", "listedAt");

-- CreateIndex
CREATE INDEX "Space_hostId_idx" ON "Space"("hostId");

-- CreateIndex
CREATE INDEX "Photo_spaceId_sortOrder_idx" ON "Photo"("spaceId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Inquiry_spaceId_createdAt_idx" ON "Inquiry"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Inquiry_status_createdAt_idx" ON "Inquiry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "HostApplication_status_createdAt_idx" ON "HostApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FilmCredit_spaceId_idx" ON "FilmCredit"("spaceId");

-- CreateIndex
CREATE INDEX "_SpaceToTag_B_index" ON "_SpaceToTag"("B");

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilmCredit" ADD CONSTRAINT "FilmCredit_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SpaceToTag" ADD CONSTRAINT "_SpaceToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SpaceToTag" ADD CONSTRAINT "_SpaceToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
