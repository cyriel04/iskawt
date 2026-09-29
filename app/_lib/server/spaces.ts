// Public reads of Space. Every query here feeds a public page, so every relation
// is read with an explicit `select` — never `include`, and never `host: true`.
// Host contact details, exactAddress and coordinates are not selected at all.

import { cache } from "react";
import { prisma } from "@/app/_lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { PublicPhoto, SpaceCard, SpaceDetail } from "@/app/_lib/types";

// A space is public only when it is published AND a human has verified its host.
export const publishedWhere = {
	status: "PUBLISHED",
	host: { verifiedAt: { not: null } },
} satisfies Prisma.SpaceWhereInput;

// Cover photo first, then the host's order.
const photoOrder = [
	{ isCover: "desc" },
	{ sortOrder: "asc" },
] satisfies Prisma.PhotoOrderByWithRelationInput[];

export const cardSelect = {
	slug: true,
	title: true,
	city: true,
	areaName: true,
	type: true,
	floorAreaSqm: true,
	maxCrew: true,
	naturalLight: true,
	hourlyRate: true,
	halfDayRate: true,
	fullDayRate: true,
	minimumHours: true,
	photos: { select: { url: true, alt: true }, orderBy: photoOrder, take: 1 },
} satisfies Prisma.SpaceSelect;

export const detailSelect = {
	...cardSelect,
	photos: { select: { url: true, alt: true }, orderBy: photoOrder },
	description: true,
	setting: true,
	rateNotes: true,
	ceilingHeightM: true,
	windowDirection: true,
	powerOutlets: true,
	powerAccess: true,
	blackoutCapable: true,
	noiseLevel: true,
	soundproofed: true,
	hasWifi: true,
	hasElevator: true,
	parkingSpaces: true,
	restrooms: true,
	loadInNotes: true,
	accessNotes: true,
	houseRules: true,
	availabilityNotes: true,
	tags: { select: { slug: true, label: true }, orderBy: { label: "asc" } },
	host: { select: { displayName: true, about: true, respondsInHours: true } },
	filmCredits: {
		select: { title: true, year: true, productionType: true, sourceUrl: true },
		orderBy: [{ year: { sort: "desc", nulls: "last" } }, { title: "asc" }],
	},
} satisfies Prisma.SpaceSelect;

type CardRow = Prisma.SpaceGetPayload<{ select: typeof cardSelect }>;
type DetailRow = Prisma.SpaceGetPayload<{ select: typeof detailSelect }>;

// Mappers rebuild every object field by field. Spreading a row would carry
// along anything a future edit adds to the select.
function toPublicPhoto(photo: PublicPhoto): PublicPhoto {
	return { url: photo.url, alt: photo.alt };
}

export function toSpaceCard(row: CardRow): SpaceCard {
	const cover = row.photos.at(0);
	return {
		slug: row.slug,
		title: row.title,
		city: row.city,
		areaName: row.areaName,
		type: row.type,
		coverPhoto: cover ? toPublicPhoto(cover) : null,
		rates: {
			hourly: row.hourlyRate,
			halfDay: row.halfDayRate,
			fullDay: row.fullDayRate,
			minimumHours: row.minimumHours,
		},
		floorAreaSqm: row.floorAreaSqm,
		maxCrew: row.maxCrew,
		naturalLight: row.naturalLight,
	};
}

export function toSpaceDetail(row: DetailRow): SpaceDetail {
	return {
		...toSpaceCard(row),
		description: row.description,
		setting: row.setting,
		photos: row.photos.map(toPublicPhoto),
		tags: row.tags.map((tag) => ({ slug: tag.slug, label: tag.label })),
		host: {
			displayName: row.host.displayName,
			about: row.host.about,
			respondsInHours: row.host.respondsInHours,
		},
		rateNotes: row.rateNotes,
		ceilingHeightM: row.ceilingHeightM === null ? null : row.ceilingHeightM.toNumber(),
		windowDirection: row.windowDirection,
		powerOutlets: row.powerOutlets,
		powerAccess: row.powerAccess,
		blackoutCapable: row.blackoutCapable,
		noiseLevel: row.noiseLevel,
		soundproofed: row.soundproofed,
		hasWifi: row.hasWifi,
		hasElevator: row.hasElevator,
		parkingSpaces: row.parkingSpaces,
		restrooms: row.restrooms,
		loadInNotes: row.loadInNotes,
		accessNotes: row.accessNotes,
		houseRules: row.houseRules,
		availabilityNotes: row.availabilityNotes,
		filmCredits: row.filmCredits.map((credit) => ({
			title: credit.title,
			year: credit.year,
			productionType: credit.productionType,
			sourceUrl: credit.sourceUrl,
		})),
	};
}

export async function listPublishedSpaces(): Promise<SpaceCard[]> {
	const rows = await prisma.space.findMany({
		where: publishedWhere,
		select: cardSelect,
		orderBy: [{ listedAt: { sort: "desc", nulls: "last" } }, { slug: "asc" }],
	});
	return rows.map(toSpaceCard);
}

// cache() lets generateMetadata and the page share one query per request.
export const getPublishedSpaceBySlug = cache(
	async (slug: string): Promise<SpaceDetail | null> => {
		const row = await prisma.space.findFirst({
			where: { ...publishedWhere, slug },
			select: detailSelect,
		});
		return row ? toSpaceDetail(row) : null;
	},
);
