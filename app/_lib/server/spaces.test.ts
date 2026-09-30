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
	listPublishedSpaces,
	publishedWhere,
	searchPublishedSpaces,
} from "@/app/_lib/server/spaces";
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

describe("listPublishedSpaces", () => {
	it("queries published spaces with the card select", async () => {
		mockFindMany.mockResolvedValue([]);

		await listPublishedSpaces();

		expect(mockFindMany).toHaveBeenCalledWith({
			where: publishedWhere,
			select: cardSelect,
			orderBy: [{ listedAt: { sort: "desc", nulls: "last" } }, { slug: "asc" }],
		});
	});

	it("maps a row to a SpaceCard", async () => {
		mockFindMany.mockResolvedValue([cardRow]);

		const [card] = await listPublishedSpaces();

		expect(card).toStrictEqual({
			slug: "demo-poblacion-loft",
			title: "[DEMO] Corner loft with afternoon light",
			city: "MAKATI",
			areaName: "Poblacion",
			type: "APARTMENT",
			coverPhoto: { url: "https://example.invalid/demo-cover.jpg", alt: "Demo cover photo" },
			rates: { hourly: 1800, halfDay: 7000, fullDay: 12000, minimumHours: 3 },
			floorAreaSqm: 68,
			maxCrew: 12,
			naturalLight: "ABUNDANT",
		});
	});

	it("gives a null cover photo when the space has no photos", async () => {
		mockFindMany.mockResolvedValue([{ ...cardRow, photos: [] }]);

		const [card] = await listPublishedSpaces();

		expect(card.coverPhoto).toBeNull();
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

const listOrder = [{ listedAt: { sort: "desc", nulls: "last" } }, { slug: "asc" }];

describe("buildSpaceWhere", () => {
	it("is just publishedWhere when no filter is set", () => {
		expect(buildSpaceWhere(noFilters)).toEqual(publishedWhere);
	});

	it("ignores the page", () => {
		expect(buildSpaceWhere(filters({ page: 4 }))).toEqual(publishedWhere);
	});

	it("matches q case-insensitively across title, description, areaName and tag labels", () => {
		expect(buildSpaceWhere(filters({ q: "white cyc" }))).toEqual({
			...publishedWhere,
			AND: [
				{
					OR: [
						{ title: { contains: "white cyc", mode: "insensitive" } },
						{ description: { contains: "white cyc", mode: "insensitive" } },
						{ areaName: { contains: "white cyc", mode: "insensitive" } },
						{ tags: { some: { label: { contains: "white cyc", mode: "insensitive" } } } },
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
				{
					OR: [
						{ title: { contains: "loft", mode: "insensitive" } },
						{ description: { contains: "loft", mode: "insensitive" } },
						{ areaName: { contains: "loft", mode: "insensitive" } },
						{ tags: { some: { label: { contains: "loft", mode: "insensitive" } } } },
					],
				},
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
