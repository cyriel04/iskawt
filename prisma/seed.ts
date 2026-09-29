/**
 * Iskawt — demo seed data
 *
 * ============================ READ THIS FIRST ============================
 * Every host and space in this file is DEMO DATA. No real person has agreed
 * to any of it. Rates, specs and photo slots are illustrative.
 *
 * What is real: the city, the barangay or area name, and the street. Those
 * are public Metro Manila geography and safe to name.
 *
 * What is bracketed: the unit number, house number, and building name — the
 * parts that would identify an actual property. The convention is:
 *
 *     [UNIT NO.] [BUILDING NAME], <real street>, <real area>, <real city>
 *
 * Keep the brackets until a real host gives you a real address in writing.
 * A filled-in address in this file means someone agreed to be listed.
 *
 * Coordinates are rough area centroids rounded to 3 decimals (~100m), which
 * is the approximate precision the public map is meant to have anyway. Replace
 * them with properly jittered values when real listings land.
 * =========================================================================
 *
 * Run with `pnpm db:seed` (the seed command lives in prisma7.config.ts).
 * Safe to re-run: everything upserts on slug or contactEmail.
 */

// Load .env before app/_lib/db.ts reads DATABASE_URL. Must stay the first import.
import "dotenv/config";
import { prisma } from "../app/_lib/db";

const DEMO_MARKER = "[DEMO]";

const tags = [
	{ slug: "brick-wall", label: "Brick wall" },
	{ slug: "white-walls", label: "White walls" },
	{ slug: "wood-floors", label: "Wood floors" },
	{ slug: "city-view", label: "City view" },
	{ slug: "large-windows", label: "Large windows" },
	{ slug: "mid-century", label: "Mid-century furniture" },
	{ slug: "industrial", label: "Industrial" },
	{ slug: "greenery", label: "Greenery" },
	{ slug: "high-ceilings", label: "High ceilings" },
	{ slug: "street-level", label: "Street level access" },
];

// `.invalid` is a reserved TLD that can never resolve. If the inquiry relay ever
// tries to email a demo host, it fails loudly instead of mailing a stranger.
const hosts = [
	{
		key: "demo-host-a",
		displayName: "Demo Host A",
		about: "Placeholder host record. Replace with a real host once someone agrees to list.",
		contactEmail: "demo-a@example.invalid",
		contactPhone: null,
		respondsInHours: 12,
		verified: true,
	},
	{
		key: "demo-host-b",
		displayName: "Demo Host B",
		about: "Placeholder host record. Replace with a real host once someone agrees to list.",
		contactEmail: "demo-b@example.invalid",
		contactPhone: null,
		respondsInHours: 24,
		verified: true,
	},
	{
		key: "demo-host-c",
		displayName: "Demo Host C",
		about: "Placeholder host record. Replace with a real host once someone agrees to list.",
		contactEmail: "demo-c@example.invalid",
		contactPhone: null,
		respondsInHours: 4,
		verified: true,
	},
];

// Enum values are string literals (`as const` keeps their exact types), so this
// file doesn't depend on where the Prisma client is generated.
const spaces = [
	{
		hostKey: "demo-host-a",
		slug: "demo-poblacion-loft",
		title: `${DEMO_MARKER} Corner loft with afternoon light`,
		description:
			"Upper-floor loft in a walk-up off the main strip. Open plan, exposed ceiling, one long wall of windows facing west. Street noise picks up after dark.",
		city: "MAKATI",
		areaName: "Poblacion",
		barangay: "Poblacion",
		exactAddress: "[UNIT NO.] [BUILDING NAME], Polaris St, Poblacion, Makati City",
		latitude: 14.565,
		longitude: 121.03,
		type: "APARTMENT",
		setting: "INDOOR",
		floorAreaSqm: 68,
		ceilingHeightM: 3.4,
		maxCrew: 12,
		hourlyRate: 1800,
		halfDayRate: 7000,
		fullDayRate: 12000,
		minimumHours: 3,
		rateNotes: "Illustrative rates. Overtime and cleaning to be agreed with the host.",
		naturalLight: "ABUNDANT",
		windowDirection: "West-facing",
		powerOutlets: 14,
		powerAccess: "ON_SITE",
		blackoutCapable: true,
		noiseLevel: "MEDIUM",
		hasWifi: true,
		hasElevator: false,
		parkingSpaces: 1,
		restrooms: 1,
		loadInNotes: "Third floor, no lift. Narrow stair turn — flight cases over 1m will not make the corner.",
		accessNotes: "Building has no security desk. Host meets the crew at street level.",
		houseRules: "No smoke machines. No open flame. Shoes off past the entry mat.",
		availabilityNotes: "Weekdays only. Nothing before 9am.",
		tags: ["large-windows", "wood-floors", "mid-century", "high-ceilings"],
	},
	{
		hostKey: "demo-host-a",
		slug: "demo-kapitolyo-rowhouse",
		title: `${DEMO_MARKER} Two-storey rowhouse with a back garden`,
		description:
			"Family rowhouse on a quiet residential street. Tiled ground floor, carpeted bedrooms upstairs, small planted yard at the back with a concrete wall that takes light well.",
		city: "PASIG",
		areaName: "Kapitolyo",
		barangay: "Kapitolyo",
		exactAddress: "[HOUSE NO.] United St, Kapitolyo, Pasig City",
		latitude: 14.571,
		longitude: 121.06,
		type: "HOUSE",
		setting: "BOTH",
		floorAreaSqm: 120,
		ceilingHeightM: 2.7,
		maxCrew: 15,
		hourlyRate: 1500,
		halfDayRate: 5500,
		fullDayRate: 9500,
		minimumHours: 4,
		rateNotes: "Illustrative rates. Garden and interior priced together.",
		naturalLight: "MODERATE",
		windowDirection: "East-facing front, open yard at rear",
		powerOutlets: 20,
		powerAccess: "ON_SITE",
		blackoutCapable: false,
		noiseLevel: "LOW",
		hasWifi: true,
		hasElevator: false,
		parkingSpaces: 2,
		restrooms: 2,
		loadInNotes: "Street-level entry, gate is 1.8m wide. Van can park in the driveway.",
		accessNotes: "Residential street — neighbours notice. Host asks for a heads-up on crew size.",
		houseRules: "No furniture moved between floors. No shooting past 8pm.",
		availabilityNotes: "Weekends preferred.",
		tags: ["greenery", "street-level", "wood-floors"],
	},
	{
		hostKey: "demo-host-b",
		slug: "demo-escolta-office",
		title: `${DEMO_MARKER} Pre-war office floor, unrenovated`,
		description:
			"Half-floor in a heritage building on Escolta. Original terrazzo, tall casement windows, peeling paint left as-is. Lift is original and slow.",
		city: "MANILA",
		areaName: "Escolta, Binondo",
		barangay: "Binondo",
		exactAddress: "[FLOOR] [BUILDING NAME], Escolta St, Binondo, Manila",
		latitude: 14.597,
		longitude: 120.978,
		type: "OFFICE",
		setting: "INDOOR",
		floorAreaSqm: 180,
		ceilingHeightM: 4.2,
		maxCrew: 20,
		hourlyRate: 2500,
		halfDayRate: 9000,
		fullDayRate: 16000,
		minimumHours: 4,
		rateNotes: "Illustrative rates. Building charges a separate after-hours fee.",
		naturalLight: "ABUNDANT",
		windowDirection: "North light along the long wall",
		powerOutlets: 8,
		powerAccess: "LIMITED",
		blackoutCapable: true,
		noiseLevel: "MEDIUM",
		hasWifi: false,
		hasElevator: true,
		parkingSpaces: 0,
		restrooms: 2,
		loadInNotes: "Original lift, roughly 400kg. Stairs are the practical route for anything heavy.",
		accessNotes: "Building closes at 6pm without prior arrangement. Security logs every crew member.",
		houseRules: "Nothing drilled or taped to original surfaces. No repainting.",
		availabilityNotes: "Weekday daytime. After-hours by arrangement.",
		tags: ["high-ceilings", "large-windows", "industrial"],
	},
	{
		hostKey: "demo-host-b",
		slug: "demo-cubao-warehouse",
		title: `${DEMO_MARKER} Bare warehouse bay with roller door`,
		description:
			"Single-span warehouse bay, bare concrete, steel trusses overhead. Roller door opens straight onto the yard, so a vehicle can be driven inside.",
		city: "QUEZON_CITY",
		areaName: "Cubao",
		barangay: "Socorro",
		exactAddress: "[BLDG NO.] [COMPOUND NAME], 15th Ave, Cubao, Quezon City",
		latitude: 14.62,
		longitude: 121.055,
		type: "WAREHOUSE",
		setting: "INDOOR",
		floorAreaSqm: 320,
		ceilingHeightM: 6.5,
		maxCrew: 35,
		hourlyRate: 2000,
		halfDayRate: 8000,
		fullDayRate: 14000,
		minimumHours: 4,
		rateNotes: "Illustrative rates. Generator hire not included.",
		naturalLight: "MINIMAL",
		windowDirection: "Clerestory strip on the south side only",
		powerOutlets: 4,
		powerAccess: "GENERATOR_REQUIRED",
		blackoutCapable: true,
		noiseLevel: "LOW",
		hasWifi: false,
		hasElevator: false,
		parkingSpaces: 6,
		restrooms: 1,
		loadInNotes: "Roller door 4m wide, 4m high. Truck reverses to the threshold.",
		accessNotes: "Shared compound. Gate closes 10pm.",
		houseRules: "No welding. No paint on the floor without a drop sheet.",
		availabilityNotes: "Most days. Two days' notice preferred.",
		tags: ["industrial", "high-ceilings", "street-level"],
	},
	{
		hostKey: "demo-host-b",
		slug: "demo-malate-apartment",
		title: `${DEMO_MARKER} Lived-in apartment, period fittings`,
		description:
			"Second-floor apartment with original floor tiles, a narrow kitchen and a balcony over the street. Furnished and genuinely lived in, not styled.",
		city: "MANILA",
		areaName: "Malate",
		barangay: "Malate",
		exactAddress: "[UNIT NO.] [BUILDING NAME], Adriatico St, Malate, Manila",
		latitude: 14.573,
		longitude: 120.987,
		type: "APARTMENT",
		setting: "INDOOR",
		floorAreaSqm: 54,
		ceilingHeightM: 3.0,
		maxCrew: 8,
		hourlyRate: 1200,
		halfDayRate: 4500,
		fullDayRate: 8000,
		minimumHours: 3,
		rateNotes: "Illustrative rates.",
		naturalLight: "MODERATE",
		windowDirection: "South-facing balcony",
		powerOutlets: 10,
		powerAccess: "ON_SITE",
		blackoutCapable: false,
		noiseLevel: "HIGH",
		hasWifi: true,
		hasElevator: false,
		parkingSpaces: 0,
		restrooms: 1,
		loadInNotes: "Narrow stair, tight landing. Small crews only.",
		accessNotes: "Street parking is unreliable. Nearest pay lot is a short walk.",
		houseRules: "Nothing removed from the walls. No shooting in the neighbour's stairwell.",
		availabilityNotes: "Weekday mornings.",
		tags: ["wood-floors", "street-level"],
	},
	{
		hostKey: "demo-host-c",
		slug: "demo-lilac-cafe",
		title: `${DEMO_MARKER} Café with street frontage, before opening hours`,
		description:
			"Small café with full-height glass onto the street. Available before service, so the room is empty and the light is soft. Espresso bar stays as-is.",
		city: "MARIKINA",
		areaName: "Lilac Street, Concepcion Dos",
		barangay: "Concepcion Dos",
		exactAddress: "[UNIT NO.] [BUILDING NAME], Lilac St, Concepcion Dos, Marikina City",
		latitude: 14.657,
		longitude: 121.107,
		type: "CAFE",
		setting: "INDOOR",
		floorAreaSqm: 72,
		ceilingHeightM: 3.2,
		maxCrew: 10,
		hourlyRate: 2200,
		halfDayRate: 7500,
		fullDayRate: null,
		minimumHours: 2,
		rateNotes: "Illustrative rates. Full-day not offered — the café opens at 11am.",
		naturalLight: "ABUNDANT",
		windowDirection: "East-facing glass frontage",
		powerOutlets: 16,
		powerAccess: "ON_SITE",
		blackoutCapable: false,
		noiseLevel: "LOW",
		hasWifi: true,
		hasElevator: false,
		parkingSpaces: 2,
		restrooms: 1,
		loadInNotes: "Street level, double doors. Easy.",
		accessNotes: "Must be cleared and reset by 10:30am. Staff arrive at 9.",
		houseRules: "Nothing moved behind the bar. No food styling with the café's own stock.",
		availabilityNotes: "Mornings only, 6am to 10:30am.",
		tags: ["large-windows", "street-level", "wood-floors"],
	},
	{
		hostKey: "demo-host-c",
		slug: "demo-mandaluyong-rooftop",
		title: `${DEMO_MARKER} Rooftop deck with skyline view`,
		description:
			"Open rooftop on a mid-rise residential building. Concrete deck, low parapet, unobstructed view east. No shade at all — brutal at midday, good at golden hour.",
		city: "MANDALUYONG",
		areaName: "Plainview",
		barangay: "Plainview",
		exactAddress: "[ROOF DECK] [BUILDING NAME], Shaw Blvd, Plainview, Mandaluyong City",
		latitude: 14.578,
		longitude: 121.035,
		type: "ROOFTOP",
		setting: "OUTDOOR",
		floorAreaSqm: 140,
		ceilingHeightM: null,
		maxCrew: 18,
		hourlyRate: 1600,
		halfDayRate: 6000,
		fullDayRate: 10500,
		minimumHours: 3,
		rateNotes: "Illustrative rates.",
		naturalLight: "ABUNDANT",
		windowDirection: "Open, unobstructed east",
		powerOutlets: 2,
		powerAccess: "LIMITED",
		blackoutCapable: false,
		noiseLevel: "MEDIUM",
		hasWifi: false,
		hasElevator: true,
		parkingSpaces: 3,
		restrooms: 1,
		loadInNotes: "Service lift to the top floor, then one flight of stairs to the deck.",
		accessNotes: "Building management requires a crew list 48 hours ahead.",
		houseRules: "Nothing anchored to the parapet. No drones without written clearance.",
		availabilityNotes: "Daylight hours. Cancelled in rain.",
		tags: ["city-view", "greenery"],
	},
	{
		hostKey: "demo-host-c",
		slug: "demo-san-juan-studio",
		title: `${DEMO_MARKER} White cyc studio, small format`,
		description:
			"Purpose-built shooting space with a coved white cyclorama on the long wall. Blacked out, grid overhead, no natural light by design.",
		city: "SAN_JUAN",
		areaName: "Greenhills",
		barangay: "Greenhills",
		exactAddress: "[UNIT NO.] [BUILDING NAME], Wilson St, Greenhills, San Juan City",
		latitude: 14.602,
		longitude: 121.048,
		type: "STUDIO",
		setting: "INDOOR",
		floorAreaSqm: 95,
		ceilingHeightM: 4.0,
		maxCrew: 14,
		hourlyRate: 2800,
		halfDayRate: 10000,
		fullDayRate: 18000,
		minimumHours: 2,
		rateNotes: "Illustrative rates. Lighting kit hire quoted separately.",
		naturalLight: "NONE",
		windowDirection: null,
		powerOutlets: 24,
		powerAccess: "ON_SITE",
		blackoutCapable: true,
		noiseLevel: "LOW",
		hasWifi: true,
		hasElevator: true,
		parkingSpaces: 4,
		restrooms: 2,
		loadInNotes: "Loading bay at the rear, lift takes 600kg.",
		accessNotes: "24-hour access with prior arrangement.",
		houseRules: "Cyc repainted between bookings — no shoes on the cove.",
		availabilityNotes: "Any day, subject to existing bookings.",
		tags: ["white-walls", "high-ceilings", "industrial"],
	},
] as const;

async function main() {
	console.log("Seeding DEMO data. No real hosts or spaces are in this file.\n");

	for (const tag of tags) {
		await prisma.tag.upsert({
			where: { slug: tag.slug },
			update: { label: tag.label },
			create: tag,
		});
	}
	console.log(`Tags: ${tags.length}`);

	const hostIds = new Map<string, string>();

	for (const host of hosts) {
		const verifiedAt = host.verified ? new Date() : null;
		const record = await prisma.host.upsert({
			where: { contactEmail: host.contactEmail },
			update: {
				displayName: host.displayName,
				about: host.about,
				respondsInHours: host.respondsInHours,
				verifiedAt,
			},
			create: {
				displayName: host.displayName,
				about: host.about,
				contactEmail: host.contactEmail,
				contactPhone: host.contactPhone,
				respondsInHours: host.respondsInHours,
				verifiedAt,
			},
		});
		hostIds.set(host.key, record.id);
	}
	console.log(`Hosts: ${hosts.length}`);

	for (const space of spaces) {
		const { hostKey, tags: tagSlugs, ...fields } = space;
		const hostId = hostIds.get(hostKey);
		if (!hostId) throw new Error(`No host for key ${hostKey}`);

		const tagRefs = tagSlugs.map((slug) => ({ slug }));
		const base = {
			...fields,
			hostId,
			status: "PUBLISHED" as const,
			verifiedAt: new Date(),
			listedAt: new Date(),
		};

		await prisma.space.upsert({
			where: { slug: space.slug },
			// `set` replaces the tag list on re-runs; `create` can only `connect`.
			update: { ...base, tags: { set: tagRefs } },
			create: { ...base, tags: { connect: tagRefs } },
		});
	}
	console.log(`Spaces: ${spaces.length}`);

	const cities = new Set(spaces.map((s) => s.city));
	console.log(`\nDone. ${cities.size} cities represented.`);
	console.log("Every title carries the [DEMO] marker. Remove it only when a real host agrees.");
}

main()
	.catch((error) => {
		console.error(error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
