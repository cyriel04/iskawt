import { EMPTY_FILTERS, CITY_VALUES, LIGHT_VALUES, SETTING_VALUES, SPACE_TYPE_VALUES, hasActiveFilters, paramValue, parseSpaceFilters, serializeSpaceFilters, spacesHref } from "@/app/_lib/spaceFilters";
import type { SpaceFilters } from "@/app/_lib/types";

const full: SpaceFilters = {
	q: "white cyc",
	cities: ["MAKATI", "PASIG", "QUEZON_CITY"],
	types: ["STUDIO", "WAREHOUSE"],
	setting: "OUTDOOR",
	naturalLight: ["ABUNDANT", "MODERATE"],
	minCrew: 10,
	hourlyRate: { min: 1000, max: 3000 },
	page: 2,
};

describe("parseSpaceFilters", () => {
	it("parses no params to the empty filters", () => {
		expect(parseSpaceFilters({})).toEqual(EMPTY_FILTERS);
		expect(EMPTY_FILTERS).toEqual({
			q: null,
			cities: [],
			types: [],
			setting: null,
			naturalLight: [],
			minCrew: null,
			hourlyRate: { min: null, max: null },
			page: 1,
		});
	});

	it("parses every key of the URL shape", () => {
		expect(
			parseSpaceFilters({
				q: "white cyc",
				city: ["pasig", "makati", "quezon-city"],
				type: ["warehouse", "studio"],
				setting: "outdoor",
				light: ["moderate", "abundant"],
				crew: "10",
				rateMin: "1000",
				rateMax: "3000",
				page: "2",
			}),
		).toEqual(full);
	});

	it("accepts a single repeatable value as a plain string", () => {
		expect(parseSpaceFilters({ city: "las-pinas" }).cities).toEqual(["LAS_PINAS"]);
	});

	it("drops unknown, uppercase and duplicate enum values silently", () => {
		const f = parseSpaceFilters({
			city: ["makati", "cebu", "MAKATI", "makati", "quezon_city"],
			type: ["castle", "event-space"],
			light: ["unknown", "none"],
		});
		expect(f.cities).toEqual(["MAKATI"]);
		expect(f.types).toEqual(["EVENT_SPACE"]);
		expect(f.naturalLight).toEqual(["NONE"]);
	});

	it("does not accept both as a setting", () => {
		expect(parseSpaceFilters({ setting: "both" }).setting).toBeNull();
		expect(parseSpaceFilters({ setting: "indoor" }).setting).toBe("INDOOR");
	});

	it("trims and collapses whitespace in the search text", () => {
		expect(parseSpaceFilters({ q: "  white \n  cyc\t " }).q).toBe("white cyc");
	});

	it("treats blank search text as no search", () => {
		expect(parseSpaceFilters({ q: "   " }).q).toBeNull();
		expect(parseSpaceFilters({ q: "" }).q).toBeNull();
	});

	it("caps the search text at 100 characters without a trailing space", () => {
		const long = `${"a".repeat(99)} ${"b".repeat(50)}`;
		const q = parseSpaceFilters({ q: long }).q;
		expect(q).toBe("a".repeat(99));
		expect(parseSpaceFilters({ q: "c".repeat(150) }).q).toHaveLength(100);
	});

	it("counts the search cap in characters, never splitting an emoji", () => {
		const q = parseSpaceFilters({ q: `${"a".repeat(99)}📸 rooftop` }).q;
		expect(q).toBe(`${"a".repeat(99)}📸`);
		expect(q?.isWellFormed()).toBe(true);
		const emoji = parseSpaceFilters({ q: "📸".repeat(150) }).q ?? "";
		expect([...emoji]).toHaveLength(100);
		expect(emoji.isWellFormed()).toBe(true);
	});

	it("uses the first value when a single-valued key repeats", () => {
		const f = parseSpaceFilters({ q: ["one", "two"], crew: ["4", "8"], setting: ["indoor", "outdoor"] });
		expect(f.q).toBe("one");
		expect(f.minCrew).toBe(4);
		expect(f.setting).toBe("INDOOR");
	});

	it.each(["0", "-5", "2.5", "1e3", "ten", "", " 5", "+5", "99999999999999999999"])(
		"drops a crew or rate of %j",
		(bad) => {
			const f = parseSpaceFilters({ crew: bad, rateMin: bad, rateMax: bad });
			expect(f.minCrew).toBeNull();
			expect(f.hourlyRate).toEqual({ min: null, max: null });
		},
	);

	it("keeps one rate bound when the other is missing", () => {
		expect(parseSpaceFilters({ rateMax: "2500" }).hourlyRate).toEqual({ min: null, max: 2500 });
	});

	it("swaps a minimum rate above the maximum", () => {
		expect(parseSpaceFilters({ rateMin: "3000", rateMax: "1000" }).hourlyRate).toEqual({
			min: 1000,
			max: 3000,
		});
	});

	it.each([
		["crew", "1000"],
		["crew", "3000000000"],
		["rateMin", "1000000"],
		["rateMax", "99999999999"],
	])("drops %s=%j, above its cap", (key, value) => {
		const f = parseSpaceFilters({ [key]: value });
		expect(f.minCrew).toBeNull();
		expect(f.hourlyRate).toEqual({ min: null, max: null });
	});

	it("keeps a crew and rates at their caps", () => {
		const f = parseSpaceFilters({ crew: "999", rateMin: "999999", rateMax: "999999" });
		expect(f.minCrew).toBe(999);
		expect(f.hourlyRate).toEqual({ min: 999999, max: 999999 });
	});

	it("keeps one rate bound when the other is above its cap", () => {
		expect(parseSpaceFilters({ rateMin: "500", rateMax: "99999999999" }).hourlyRate).toEqual({
			min: 500,
			max: null,
		});
	});

	it("reads leading zeros by value, within the cap", () => {
		const f = parseSpaceFilters({ crew: "0999", rateMin: "0500000", page: "007" });
		expect(f.minCrew).toBe(999);
		expect(f.hourlyRate.min).toBe(500000);
		expect(f.page).toBe(7);
	});

	it.each([["crew", "01000"], ["crew", "000"], ["rateMax", "01000000"]])(
		"still drops %s=%j",
		(key, value) => {
			const f = parseSpaceFilters({ [key]: value });
			expect(f.minCrew).toBeNull();
			expect(f.hourlyRate).toEqual({ min: null, max: null });
		},
	);

	it("serialises a leading-zero URL back to its canonical form", () => {
		expect(serializeSpaceFilters(parseSpaceFilters({ crew: "0010" })).toString()).toBe("crew=10");
	});

	it("keeps page 999", () => {
		expect(parseSpaceFilters({ page: "999" }).page).toBe(999);
	});

	it.each(["0", "-1", "1.5", "abc", "", "99999999999999999999", "1000", "9007199254740991"])("reads page %j as page 1", (bad) => {
		expect(parseSpaceFilters({ page: bad }).page).toBe(1);
	});

	it("ignores keys outside the URL shape", () => {
		expect(parseSpaceFilters({ sort: "price", utm_source: "x", cities: "makati" })).toEqual(EMPTY_FILTERS);
	});

	it("turns a URL full of bad values into sane filters", () => {
		const params = Object.fromEntries(
			new URLSearchParams(
				"q=%20%20&city=atlantis&city=Makati&type=&setting=sky&light=unknown&crew=-3&rateMin=abc&rateMax=0&page=-2",
			),
		);
		expect(parseSpaceFilters(params)).toEqual(EMPTY_FILTERS);
	});
});

describe("serializeSpaceFilters", () => {
	it("writes nothing for the empty filters", () => {
		expect(serializeSpaceFilters(EMPTY_FILTERS).toString()).toBe("");
	});

	it("writes keys in a fixed order with repeated values sorted", () => {
		const unsorted: SpaceFilters = {
			...full,
			cities: ["QUEZON_CITY", "PASIG", "MAKATI"],
			types: ["WAREHOUSE", "STUDIO"],
			naturalLight: ["MODERATE", "ABUNDANT"],
		};
		expect(serializeSpaceFilters(unsorted).toString()).toBe(
			"q=white+cyc&city=makati&city=pasig&city=quezon-city&type=studio&type=warehouse&setting=outdoor" +
				"&light=abundant&light=moderate&crew=10&rateMin=1000&rateMax=3000&page=2",
		);
	});

	it("omits page 1", () => {
		expect(serializeSpaceFilters({ ...EMPTY_FILTERS, cities: ["MAKATI"] }).toString()).toBe("city=makati");
	});

	it("produces the same URL for the same filters in any order", () => {
		const a = serializeSpaceFilters({ ...EMPTY_FILTERS, cities: ["PASIG", "MAKATI"] }).toString();
		const b = serializeSpaceFilters({ ...EMPTY_FILTERS, cities: ["MAKATI", "PASIG"] }).toString();
		expect(a).toBe(b);
	});
});

// Tiny deterministic PRNG so the property test is reproducible.
function mulberry32(seed: number) {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function subset<T extends string>(values: readonly T[], rand: () => number): T[] {
	return values
		.filter(() => rand() < 0.3)
		.sort((x, y) => (paramValue(x) < paramValue(y) ? -1 : paramValue(x) > paramValue(y) ? 1 : 0));
}

function randomFilters(rand: () => number): SpaceFilters {
	const maybe = (n: number) => (rand() < 0.5 ? null : n);
	const words = ["white", "cyc", "rooftop", "Poblacion", "café", "a&b", "100%", "+plus"];
	const q = rand() < 0.5 ? null : words.filter(() => rand() < 0.5).join(" ") || null;
	// Anywhere in 1..cap, and the cap itself now and then: the edge must round-trip too.
	const upTo = (cap: number) => (rand() < 0.1 ? cap : 1 + Math.floor(rand() * cap));
	const low = maybe(upTo(999999));
	const high = maybe(upTo(999999));
	return {
		q,
		cities: subset(CITY_VALUES, rand),
		types: subset(SPACE_TYPE_VALUES, rand),
		setting: rand() < 0.33 ? null : SETTING_VALUES[Math.floor(rand() * SETTING_VALUES.length)],
		naturalLight: subset(LIGHT_VALUES, rand),
		minCrew: maybe(upTo(999)),
		hourlyRate:
			low !== null && high !== null ? { min: Math.min(low, high), max: Math.max(low, high) } : { min: low, max: high },
		page: upTo(999),
	};
}

function roundTrip(f: SpaceFilters): SpaceFilters {
	const params = serializeSpaceFilters(f);
	const raw: Record<string, string[]> = {};
	for (const key of new Set(params.keys())) raw[key] = params.getAll(key);
	return parseSpaceFilters(raw);
}

describe("round trip", () => {
	it("parse(serialize(f)) equals f for the empty and full filters", () => {
		expect(roundTrip(EMPTY_FILTERS)).toEqual(EMPTY_FILTERS);
		expect(roundTrip(full)).toEqual(full);
	});

	it("parse(serialize(f)) equals f for 500 generated filters", () => {
		const rand = mulberry32(20260930);
		for (let i = 0; i < 500; i++) {
			const f = randomFilters(rand);
			expect(roundTrip(f)).toEqual(f);
		}
	});

	it("survives a trip through a real URL string", () => {
		const url = new URL(spacesHref(full), "https://iskawt.example");
		const raw: Record<string, string[]> = {};
		for (const key of new Set(url.searchParams.keys())) raw[key] = url.searchParams.getAll(key);
		expect(parseSpaceFilters(raw)).toEqual(full);
	});
});

describe("spacesHref", () => {
	it("is the bare root for no filters", () => {
		expect(spacesHref(EMPTY_FILTERS)).toBe("/");
	});

	it("links to a city", () => {
		expect(spacesHref({ ...EMPTY_FILTERS, cities: ["QUEZON_CITY"] })).toBe("/?city=quezon-city");
	});
});

describe("hasActiveFilters", () => {
	it("is false for the empty filters, even on a later page", () => {
		expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
		expect(hasActiveFilters({ ...EMPTY_FILTERS, page: 3 })).toBe(false);
	});

	it("is true when any filter or search is set", () => {
		expect(hasActiveFilters({ ...EMPTY_FILTERS, q: "loft" })).toBe(true);
		expect(hasActiveFilters({ ...EMPTY_FILTERS, hourlyRate: { min: null, max: 900 } })).toBe(true);
	});
});
