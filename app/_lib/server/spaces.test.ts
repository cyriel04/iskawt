/** @jest-environment node */
import { Decimal } from "@prisma/client/runtime/index-browser";

const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();

jest.mock("@/app/_lib/db", () => ({
	prisma: {
		space: {
			findMany: (...args: unknown[]) => mockFindMany(...args),
			findFirst: (...args: unknown[]) => mockFindFirst(...args),
		},
	},
}));

import {
	cardSelect,
	detailSelect,
	getPublishedSpaceBySlug,
	listPublishedSpaces,
	publishedWhere,
} from "@/app/_lib/server/spaces";

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
