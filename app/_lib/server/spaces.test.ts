/** @jest-environment node */
import { Decimal } from "@prisma/client/runtime/index-browser";

const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockCount = jest.fn();

jest.mock("@/app/_lib/db", () => ({
	prisma: {
		space: {
			findMany: (...args: unknown[]) => mockFindMany(...args),
			findFirst: (...args: unknown[]) => mockFindFirst(...args),
			count: (...args: unknown[]) => mockCount(...args),
		},
	},
}));

import {
	PAGE_SIZE,
	buildSpaceWhere,
	cardSelect,
	detailSelect,
	getPublishedSpaceBySlug,
	matchLabels,
	publishedWhere,
	searchPublishedSpaces,
} from "@/app/_lib/server/spaces";
import { cityLabels, spaceTypeLabels } from "@/app/_components/labels";
import type { SpaceFilters } from "@/app/_lib/types";

// DEMO rows, shaped like what Prisma returns for cardSelect / detailSelect.
const cardRow = {
	slug: "demo-poblacion-loft",
	title: "[DEMO] Corner loft with afternoon light",
	city: "MAKATI",
	areaName: "Poblacion",
	type: "APARTMENT",
	floorAreaSqm: 68,
	maxCrew: 12,
	naturalLight: "ABUNDANT",
	hourlyRate: 1800,
	halfDayRate: 7000,
	fullDayRate: 12000,
	minimumHours: 3,
	photos: [{ url: "https://example.invalid/demo-cover.jpg", alt: "Demo cover photo" }],
};

const detailRow = {
	...cardRow,
	description: "Upper-floor loft in a walk-up off the main strip.",
	setting: "INDOOR",
	rateNotes: "Illustrative rates.",
	ceilingHeightM: new Decimal("3.40"),
	windowDirection: "West-facing",
	powerOutlets: 14,
	powerAccess: "ON_SITE",
	blackoutCapable: true,
	noiseLevel: "MEDIUM",
	soundproofed: false,
	hasWifi: true,
	hasElevator: false,
	parkingSpaces: 1,
	restrooms: 1,
	loadInNotes: "Third floor, no lift.",
	accessNotes: "Host meets the crew at street level.",
	houseRules: "No smoke machines.",
	availabilityNotes: "Weekdays only.",
	tags: [{ slug: "large-windows", label: "Large windows" }],
	host: { displayName: "Demo Host A", about: "Placeholder host record.", respondsInHours: 12 },
	filmCredits: [
		{ title: "[DEMO] Short film", year: 2025, productionType: "FILM", sourceUrl: null },
	],
};

const PRIVATE_FIELDS = [
	"contactEmail",
	"contactPhone",
	"exactAddress",
	"latitude",
	"longitude",
	"barangay",
	"inquiries",
	"internalNote",
];

function keysDeep(value: unknown): string[] {
	if (value === null || typeof value !== "object") return [];
	return Object.entries(value).flatMap(([key, child]) => [key, ...keysDeep(child)]);
}

beforeEach(() => {
	mockFindMany.mockReset();
	mockFindFirst.mockReset();
	mockCount.mockReset();
});

describe("privacy", () => {
	it.each([
		["cardSelect", cardSelect],
		["detailSelect", detailSelect],
	])("%s selects no private field at any depth", (_name, select) => {
		const keys = keysDeep(select);
		for (const field of PRIVATE_FIELDS) {
			expect(keys).not.toContain(field);
		}
	});

	it("selects exactly the public host fields", () => {
		expect(Object.keys(detailSelect.host.select).sort()).toEqual([
			"about",
			"displayName",
			"respondsInHours",
		]);
	});

	it("does not pass through private fields even if a row carries them", async () => {
		mockFindFirst.mockResolvedValue({
			...detailRow,
			exactAddress: "[UNIT NO.] [BUILDING NAME], Polaris St, Poblacion, Makati City",
			latitude: new Decimal("14.565"),
			host: { ...detailRow.host, contactEmail: "demo-a@example.invalid", contactPhone: "0000" },
		});

		const space = await getPublishedSpaceBySlug("demo-poblacion-loft");
		const json = JSON.stringify(space);

		expect(json).not.toContain("demo-a@example.invalid");
		expect(json).not.toContain("Polaris St");
		expect(json).not.toContain("14.565");
		expect(json).not.toContain("0000");
	});
});

describe("publishedWhere", () => {
	it("requires a published space with a verified host", () => {
		expect(publishedWhere).toEqual({
			status: "PUBLISHED",
			host: { verifiedAt: { not: null } },
		});
	});
});

describe("getPublishedSpaceBySlug", () => {
	it("looks up the slug among published spaces only", async () => {
		mockFindFirst.mockResolvedValue(null);

		await getPublishedSpaceBySlug("demo-poblacion-loft");

		expect(mockFindFirst).toHaveBeenCalledWith({
			where: { ...publishedWhere, slug: "demo-poblacion-loft" },
			select: detailSelect,
		});
	});

	it("returns null when there is no published space with that slug", async () => {
		mockFindFirst.mockResolvedValue(null);

		await expect(getPublishedSpaceBySlug("does-not-exist")).resolves.toBeNull();
	});

	it("maps a row to a SpaceDetail, converting Decimal to number", async () => {
		mockFindFirst.mockResolvedValue(detailRow);

		const space = await getPublishedSpaceBySlug("demo-poblacion-loft");

		expect(space).toMatchObject({
			slug: "demo-poblacion-loft",
			ceilingHeightM: 3.4,
			host: { displayName: "Demo Host A", about: "Placeholder host record.", respondsInHours: 12 },
			tags: [{ slug: "large-windows", label: "Large windows" }],
			filmCredits: [
				{ title: "[DEMO] Short film", year: 2025, productionType: "FILM", sourceUrl: null },
			],
		});
		expect(space?.photos).toEqual([
			{ url: "https://example.invalid/demo-cover.jpg", alt: "Demo cover photo" },
		]);
	});

	it("keeps a missing ceiling height as null", async () => {
		mockFindFirst.mockResolvedValue({ ...detailRow, ceilingHeightM: null });

		const space = await getPublishedSpaceBySlug("demo-poblacion-loft");

		expect(space?.ceilingHeightM).toBeNull();
	});
});

const noFilters: SpaceFilters = {
	q: null,
	cities: [],
	types: [],
	setting: null,
	naturalLight: [],
	minCrew: null,
	hourlyRate: { min: null, max: null },
	page: 1,
};

function filters(overrides: Partial<SpaceFilters>): SpaceFilters {
	return { ...noFilters, ...overrides };
}

// One word's clause: the four text columns, then any city/type label matches.
function textMatch(word: string, ...labelMatches: object[]) {
	const contains = { contains: word, mode: "insensitive" };
	return {
		OR: [
			{ title: contains },
			{ description: contains },
			{ areaName: contains },
			{ tags: { some: { label: contains } } },
			...labelMatches,
		],
	};
}

describe("matchLabels", () => {
	it("matches a whole city name case-insensitively", () => {
		expect(matchLabels("MARIKINA", cityLabels)).toEqual(["MARIKINA"]);
	});

	it("matches part of a multi-word name", () => {
		expect(matchLabels("quezon", cityLabels)).toEqual(["QUEZON_CITY"]);
	});

	it("ignores accents in the label", () => {
		expect(matchLabels("pinas", cityLabels)).toEqual(["LAS_PINAS"]);
		expect(matchLabels("cafe", spaceTypeLabels)).toEqual(["CAFE"]);
		expect(matchLabels("paranaque", cityLabels)).toEqual(["PARANAQUE"]);
	});

	it("ignores accents in the word", () => {
		expect(matchLabels("Piñas", cityLabels)).toEqual(["LAS_PINAS"]);
		expect(matchLabels("CAFÉ", spaceTypeLabels)).toEqual(["CAFE"]);
	});

	it("returns every value whose label contains the word", () => {
		expect(matchLabels("san", cityLabels)).toEqual(["SAN_JUAN"]);
		expect(matchLabels("ma", cityLabels)).toEqual([
			"MAKATI",
			"MALABON",
			"MANDALUYONG",
			"MANILA",
			"MARIKINA",
		]);
	});

	it("returns an empty list when nothing matches", () => {
		expect(matchLabels("loft", cityLabels)).toEqual([]);
		expect(matchLabels("loft", spaceTypeLabels)).toEqual([]);
	});

	it("returns an empty list for an empty word", () => {
		expect(matchLabels("", cityLabels)).toEqual([]);
	});
});

const listOrder = [{ listedAt: { sort: "desc", nulls: "last" } }, { slug: "asc" }];

describe("buildSpaceWhere", () => {
	it("is just publishedWhere when no filter is set", () => {
		expect(buildSpaceWhere(noFilters)).toEqual(publishedWhere);
	});

	it("ignores the page", () => {
		expect(buildSpaceWhere(filters({ page: 4 }))).toEqual(publishedWhere);
	});

	it("ANDs one clause per word of q, each matching text fields case-insensitively", () => {
		expect(buildSpaceWhere(filters({ q: "white cyc" }))).toEqual({
			...publishedWhere,
			AND: [{ AND: [textMatch("white"), textMatch("cyc")] }],
		});
	});

	it("adds no city or type clause for a word that matches no label", () => {
		const where = buildSpaceWhere(filters({ q: "loft" }));
		expect(where).toEqual({ ...publishedWhere, AND: [{ AND: [textMatch("loft")] }] });
		expect(keysDeep(where)).not.toContain("city");
		expect(keysDeep(where)).not.toContain("type");
	});

	it("matches a city name that appears in no text column", () => {
		expect(buildSpaceWhere(filters({ q: "marikina" }))).toEqual({
			...publishedWhere,
			AND: [{ AND: [textMatch("marikina", { city: { in: ["MARIKINA"] } })] }],
		});
	});

	it("matches each word of a two-word city name to that city", () => {
		expect(buildSpaceWhere(filters({ q: "quezon city" }))).toEqual({
			...publishedWhere,
			AND: [
				{
					AND: [
						textMatch("quezon", { city: { in: ["QUEZON_CITY"] } }),
						textMatch("city", { city: { in: ["QUEZON_CITY"] } }),
					],
				},
			],
		});
	});

	it("matches a space type name without its accent", () => {
		expect(buildSpaceWhere(filters({ q: "cafe" }))).toEqual({
			...publishedWhere,
			AND: [{ AND: [textMatch("cafe", { type: { in: ["CAFE"] } })] }],
		});
	});

	it("adds both a city and a type clause when a word matches each", () => {
		// "ro" is in Pateros and in Rooftop, and in no other city or type name.
		const where = buildSpaceWhere(filters({ q: "ro" }));
		expect(where).toEqual({
			...publishedWhere,
			AND: [
				{
					AND: [
						textMatch("ro", { city: { in: ["PATEROS"] } }, { type: { in: ["ROOFTOP"] } }),
					],
				},
			],
		});
	});

	it("filters by any of the given cities", () => {
		expect(buildSpaceWhere(filters({ cities: ["MAKATI", "PASIG"] }))).toEqual({
			...publishedWhere,
			AND: [{ city: { in: ["MAKATI", "PASIG"] } }],
		});
	});

	it("filters by any of the given types", () => {
		expect(buildSpaceWhere(filters({ types: ["STUDIO"] }))).toEqual({
			...publishedWhere,
			AND: [{ type: { in: ["STUDIO"] } }],
		});
	});

	it("matches INDOOR and BOTH spaces for an indoor filter", () => {
		expect(buildSpaceWhere(filters({ setting: "INDOOR" }))).toEqual({
			...publishedWhere,
			AND: [{ setting: { in: ["INDOOR", "BOTH"] } }],
		});
	});

	it("matches OUTDOOR and BOTH spaces for an outdoor filter", () => {
		expect(buildSpaceWhere(filters({ setting: "OUTDOOR" }))).toEqual({
			...publishedWhere,
			AND: [{ setting: { in: ["OUTDOOR", "BOTH"] } }],
		});
	});

	it("filters by any of the given light levels, which never includes UNKNOWN", () => {
		expect(buildSpaceWhere(filters({ naturalLight: ["ABUNDANT", "MODERATE"] }))).toEqual({
			...publishedWhere,
			AND: [{ naturalLight: { in: ["ABUNDANT", "MODERATE"] } }],
		});
	});

	it("requires maxCrew to reach minCrew, which excludes a null maxCrew", () => {
		expect(buildSpaceWhere(filters({ minCrew: 10 }))).toEqual({
			...publishedWhere,
			AND: [{ maxCrew: { gte: 10 } }],
		});
	});

	it("applies a minimum hourly rate inclusively", () => {
		expect(buildSpaceWhere(filters({ hourlyRate: { min: 1000, max: null } }))).toEqual({
			...publishedWhere,
			AND: [{ hourlyRate: { gte: 1000 } }],
		});
	});

	it("applies a maximum hourly rate inclusively", () => {
		expect(buildSpaceWhere(filters({ hourlyRate: { min: null, max: 3000 } }))).toEqual({
			...publishedWhere,
			AND: [{ hourlyRate: { lte: 3000 } }],
		});
	});

	it("applies both hourly rate bounds in one clause", () => {
		expect(buildSpaceWhere(filters({ hourlyRate: { min: 1000, max: 3000 } }))).toEqual({
			...publishedWhere,
			AND: [{ hourlyRate: { gte: 1000, lte: 3000 } }],
		});
	});

	it("does not crash on a zero rate bound", () => {
		expect(buildSpaceWhere(filters({ hourlyRate: { min: 0, max: 0 } }))).toEqual({
			...publishedWhere,
			AND: [{ hourlyRate: { gte: 0, lte: 0 } }],
		});
	});

	it("combines q, city and minCrew", () => {
		expect(
			buildSpaceWhere(filters({ q: "loft", cities: ["MAKATI"], minCrew: 8 })),
		).toEqual({
			...publishedWhere,
			AND: [
				{ AND: [textMatch("loft")] },
				{ city: { in: ["MAKATI"] } },
				{ maxCrew: { gte: 8 } },
			],
		});
	});

	it("combines type, setting and a rate range", () => {
		expect(
			buildSpaceWhere(
				filters({
					types: ["ROOFTOP", "WAREHOUSE"],
					setting: "OUTDOOR",
					hourlyRate: { min: 500, max: 2500 },
				}),
			),
		).toEqual({
			...publishedWhere,
			AND: [
				{ type: { in: ["ROOFTOP", "WAREHOUSE"] } },
				{ setting: { in: ["OUTDOOR", "BOTH"] } },
				{ hourlyRate: { gte: 500, lte: 2500 } },
			],
		});
	});

	it("always keeps the published and verified-host condition", () => {
		const where = buildSpaceWhere(
			filters({ q: "x", cities: ["PASIG"], naturalLight: ["NONE"], minCrew: 1 }),
		);
		expect(where).toMatchObject(publishedWhere);
	});
});

describe("searchPublishedSpaces", () => {
	it("exports a page size of 12", () => {
		expect(PAGE_SIZE).toBe(12);
	});

	it("queries with the built where, the card select and the list order", async () => {
		mockFindMany.mockResolvedValue([]);
		mockCount.mockResolvedValue(0);
		const f = filters({ cities: ["MAKATI"], minCrew: 5 });

		await searchPublishedSpaces(f);

		expect(mockFindMany).toHaveBeenCalledTimes(1);
		expect(mockFindMany).toHaveBeenCalledWith({
			where: buildSpaceWhere(f),
			select: cardSelect,
			orderBy: listOrder,
			skip: 0,
			take: 12,
		});
		expect(mockFindMany.mock.calls[0][0].select).toBe(cardSelect);
		expect(mockCount).toHaveBeenCalledWith({ where: buildSpaceWhere(f) });
	});

	it("skips two pages for page 3", async () => {
		mockFindMany.mockResolvedValue([]);
		mockCount.mockResolvedValue(40);

		await searchPublishedSpaces(filters({ page: 3 }));

		expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 24, take: 12 }));
	});

	it("maps rows to SpaceCards and reports the totals", async () => {
		mockFindMany.mockResolvedValue([cardRow]);
		mockCount.mockResolvedValue(1);

		const result = await searchPublishedSpaces(noFilters);

		expect(result).toStrictEqual({
			spaces: [
				{
					slug: "demo-poblacion-loft",
					title: "[DEMO] Corner loft with afternoon light",
					city: "MAKATI",
					areaName: "Poblacion",
					type: "APARTMENT",
					coverPhoto: {
						url: "https://example.invalid/demo-cover.jpg",
						alt: "Demo cover photo",
					},
					rates: { hourly: 1800, halfDay: 7000, fullDay: 12000, minimumHours: 3 },
					floorAreaSqm: 68,
					maxCrew: 12,
					naturalLight: "ABUNDANT",
				},
			],
			total: 1,
			page: 1,
			pageSize: 12,
			pageCount: 1,
		});
	});

	it("gives a null cover photo when the space has no photos", async () => {
		mockFindMany.mockResolvedValue([{ ...cardRow, photos: [] }]);
		mockCount.mockResolvedValue(1);

		const { spaces } = await searchPublishedSpaces(noFilters);

		expect(spaces[0].coverPhoto).toBeNull();
	});

	it("queries with the card select and no host include when q is set", async () => {
		mockFindMany.mockResolvedValue([]);
		mockCount.mockResolvedValue(0);

		await searchPublishedSpaces(filters({ q: "marikina cafe" }));

		const args = mockFindMany.mock.calls[0][0];
		expect(args.select).toBe(cardSelect);
		expect(args).not.toHaveProperty("include");
	});

	it.each([
		[0, 0],
		[1, 1],
		[12, 1],
		[13, 2],
		[24, 2],
		[25, 3],
	])("gives pageCount %#: total %i -> %i pages", async (total, pageCount) => {
		mockFindMany.mockResolvedValue([]);
		mockCount.mockResolvedValue(total);

		const result = await searchPublishedSpaces(noFilters);

		expect(result.total).toBe(total);
		expect(result.pageCount).toBe(pageCount);
	});

	it("returns an empty result with no matches", async () => {
		mockFindMany.mockResolvedValue([]);
		mockCount.mockResolvedValue(0);

		await expect(searchPublishedSpaces(filters({ q: "nothing" }))).resolves.toStrictEqual({
			spaces: [],
			total: 0,
			page: 1,
			pageSize: 12,
			pageCount: 0,
		});
	});

	it("echoes a page past the last page with no spaces", async () => {
		mockFindMany.mockResolvedValue([]);
		mockCount.mockResolvedValue(5);

		const result = await searchPublishedSpaces(filters({ page: 9 }));

		expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 96, take: 12 }));
		expect(result).toStrictEqual({
			spaces: [],
			total: 5,
			page: 9,
			pageSize: 12,
			pageCount: 1,
		});
	});

	it("does not pass through private fields even if a row carries them", async () => {
		mockFindMany.mockResolvedValue([
			{
				...cardRow,
				exactAddress: "[UNIT NO.] [BUILDING NAME], Polaris St, Poblacion, Makati City",
				latitude: new Decimal("14.565"),
				host: {
					displayName: "Demo Host A",
					contactEmail: "demo-a@example.invalid",
					contactPhone: "0000",
				},
			},
		]);
		mockCount.mockResolvedValue(1);

		const result = await searchPublishedSpaces(noFilters);
		const keys = keysDeep(result);
		const json = JSON.stringify(result);

		for (const field of ["contactEmail", "contactPhone", "exactAddress", "latitude", "host"]) {
			expect(keys).not.toContain(field);
		}
		expect(json).not.toContain("demo-a@example.invalid");
		expect(json).not.toContain("Polaris St");
		expect(json).not.toContain("14.565");
		expect(json).not.toContain("0000");
	});
});
