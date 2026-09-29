// The public contract. Everything here can reach a page, a prop, or an API
// response, so nothing private lives here: no Host contact details, no
// exactAddress, no coordinates, no editorial state. Server queries in
// app/_lib/server/ map Prisma rows into these shapes with explicit `select`.

export type {
	City,
	SpaceType,
	Setting,
	NaturalLight,
	PowerAccess,
	Level,
	ProductionType,
} from "@/generated/prisma/enums";

import type {
	City,
	SpaceType,
	Setting,
	NaturalLight,
	PowerAccess,
	Level,
	ProductionType,
} from "@/generated/prisma/enums";

export type PublicPhoto = {
	url: string;
	alt: string;
};

export type PublicTag = {
	slug: string;
	label: string;
};

// Indicative only. Whole pesos, self-reported, never charged here.
export type IndicativeRates = {
	hourly: number | null;
	halfDay: number | null;
	fullDay: number | null;
	minimumHours: number | null;
};

// Host as a renter sees it. Deliberately a separate shape from the Prisma
// model. contactEmail and contactPhone have no field to land in.
export type PublicHost = {
	displayName: string;
	about: string | null;
	respondsInHours: number | null;
};

// Browse card: one per published space on `/`.
export type SpaceCard = {
	slug: string;
	title: string;
	city: City;
	areaName: string;
	type: SpaceType;
	coverPhoto: PublicPhoto | null;
	rates: IndicativeRates;
	floorAreaSqm: number | null;
	maxCrew: number | null;
	naturalLight: NaturalLight;
};

export type PublicFilmCredit = {
	title: string;
	year: number | null;
	productionType: ProductionType;
	sourceUrl: string | null;
};

// Detail page: `/spaces/[slug]`. Extends the card so both views agree.
export type SpaceDetail = SpaceCard & {
	description: string;
	setting: Setting;
	photos: PublicPhoto[]; // sortOrder ascending, cover first
	tags: PublicTag[];
	host: PublicHost;

	rateNotes: string | null;

	ceilingHeightM: number | null; // Decimal → number in the query layer
	windowDirection: string | null;
	powerOutlets: number | null;
	powerAccess: PowerAccess;
	blackoutCapable: boolean;
	noiseLevel: Level | null;
	soundproofed: boolean;
	hasWifi: boolean;
	hasElevator: boolean;
	parkingSpaces: number | null;
	restrooms: number | null;

	loadInNotes: string | null;
	accessNotes: string | null;
	houseRules: string | null;
	availabilityNotes: string | null;

	filmCredits: PublicFilmCredit[];
};
