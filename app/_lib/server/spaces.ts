// Public reads of Space. Every query here feeds a public page, so every relation
// is read with an explicit `select` — never `include`, and never `host: true`.
// Host contact details, exactAddress and coordinates are not selected at all.

import { cache } from "react";
import { cityLabels, spaceTypeLabels, spaceTypePluralLabels } from "@/app/_lib/constants/labels";
import { PAGE_SIZE } from "@/app/_lib/constants/limits";
import { prisma } from "@/app/_lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type {
	PublicPhoto,
	SpaceCard,
	SpaceDetail,
	SpaceFilters,
	SpaceSearchResult,
} from "@/app/_lib/types";

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

// Most recently listed first, then slug so ties page stably.
const listOrder = [
	{ listedAt: { sort: "desc", nulls: "last" } },
	{ slug: "asc" },
] satisfies Prisma.SpaceOrderByWithRelationInput[];

// Lowercase with diacritics, spaces, hyphens and dashes stripped, so "Las
// Piñas", "las-pinas" and "laspinas" all fold to "laspinas", and "event-space"
// meets "Event space" and "coworking" meets "Co-working space".
function fold(text: string): string {
	return text
		.normalize("NFD")
		.replace(/[\p{Diacritic}\p{Dash_Punctuation}\s]/gu, "")
		.toLowerCase();
}

// Pure: the enum values whose display label contains the word, ignoring case,
// accents, spacing and hyphens. Order follows the label map. An empty word
// matches nothing.
export function matchLabels<T extends string>(word: string, labels: Record<T, string>): T[] {
	const needle = fold(word);
	if (needle === "") return [];
	const isValue = (key: string): key is T => Object.hasOwn(labels, key);
	return Object.keys(labels)
		.filter(isValue)
		.filter((value) => fold(labels[value]).includes(needle));
}

// One word of q: a text column or tag contains it, or it names a city or type.
// A city/type clause is added only when some value matches, never `in: []`.
function wordWhere(word: string): Prisma.SpaceWhereInput {
	const contains = { contains: word, mode: "insensitive" } as const;
	const or: Prisma.SpaceWhereInput[] = [
		{ title: contains },
		{ description: contains },
		{ areaName: contains },
		{ tags: { some: { label: contains } } },
	];
	const cities = matchLabels(word, cityLabels);
	if (cities.length > 0) or.push({ city: { in: cities } });
	// Singular or plural: "studio" and "studios" both name STUDIO.
	const types = [
		...new Set([...matchLabels(word, spaceTypeLabels), ...matchLabels(word, spaceTypePluralLabels)]),
	];
	if (types.length > 0) or.push({ type: { in: types } });
	return { OR: or };
}

// Pure: the filters as a where clause, always ANDed with publishedWhere.
// Only set filters add a clause, so no filters is exactly publishedWhere.
export function buildSpaceWhere(filters: SpaceFilters): Prisma.SpaceWhereInput {
	const clauses: Prisma.SpaceWhereInput[] = [];

	const words = filters.q === null ? [] : filters.q.split(/\s+/).filter((w) => w !== "");
	if (words.length > 0) {
		// Every word must match somewhere; the words need not match the same field.
		clauses.push({ AND: words.map(wordWhere) });
	}
	if (filters.cities.length > 0) {
		clauses.push({ city: { in: filters.cities } });
	}
	if (filters.types.length > 0) {
		clauses.push({ type: { in: filters.types } });
	}
	if (filters.setting !== null) {
		// A BOTH space suits an indoor shoot and an outdoor one alike.
		clauses.push({ setting: { in: [filters.setting, "BOTH"] } });
	}
	if (filters.naturalLight.length > 0) {
		clauses.push({ naturalLight: { in: filters.naturalLight } });
	}
	if (filters.minCrew !== null) {
		// gte never matches NULL, so a space with no maxCrew drops out.
		clauses.push({ maxCrew: { gte: filters.minCrew } });
	}
	const { min, max } = filters.hourlyRate;
	if (min !== null || max !== null) {
		// Either bound drops spaces with a null hourlyRate, for the same reason.
		clauses.push({
			hourlyRate: {
				...(min !== null && { gte: min }),
				...(max !== null && { lte: max }),
			},
		});
	}

	return clauses.length === 0 ? { ...publishedWhere } : { ...publishedWhere, AND: clauses };
}

export async function searchPublishedSpaces(filters: SpaceFilters): Promise<SpaceSearchResult> {
	const where = buildSpaceWhere(filters);
	const [rows, total] = await Promise.all([
		prisma.space.findMany({
			where,
			select: cardSelect,
			orderBy: listOrder,
			skip: (filters.page - 1) * PAGE_SIZE,
			take: PAGE_SIZE,
		}),
		prisma.space.count({ where }),
	]);
	return {
		spaces: rows.map(toSpaceCard),
		total,
		page: filters.page,
		pageSize: PAGE_SIZE,
		pageCount: Math.ceil(total / PAGE_SIZE),
	};
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
