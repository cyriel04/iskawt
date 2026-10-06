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
	InquiryStatus,
} from "@/generated/prisma/enums";

import type {
	City,
	SpaceType,
	Setting,
	NaturalLight,
	PowerAccess,
	Level,
	ProductionType,
	InquiryStatus,
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

// ---------------------------------------------------------------- browse filters
//
// Filter state lives in the URL, so a filtered link pasted into a new tab
// reproduces the view. `SpaceFilters` is the parsed, validated form; the query
// layer only ever receives this, never raw search params.
//
// URL shape (the only accepted keys; anything else is ignored):
//
//   ?q=white+cyc            text. Every word must match one of: title, description,
//                           areaName, a tag label, the city name, the space type name
//   &city=makati&city=pasig repeatable; lowercase kebab of City
//   &type=studio            repeatable; lowercase kebab of SpaceType
//   &setting=outdoor        indoor | outdoor. BOTH spaces match either.
//   &light=abundant         repeatable; abundant | moderate | minimal | none
//   &crew=10                minimum crew the space holds (maxCrew >= crew); 1–999
//   &rateMin=1000           hourly rate, whole pesos, inclusive; 1–999999
//   &rateMax=3000
//   &page=2                 1-based; omitted means 1; 1–999
//
// Parsing is forgiving: an unknown enum value, a non-integer, a negative
// number, or one above its cap is dropped, not an error. A page URL never 400s over a bad filter.
// Serialising is canonical: fixed key order, sorted repeated values, defaults
// omitted. The same filters always produce the same URL.

// The setting a renter asks for. A BOTH space matches INDOOR and OUTDOOR alike,
// so BOTH is not itself a filter value.
export type SettingFilter = Exclude<Setting, "BOTH">;

// UNKNOWN is a data gap, not something a renter asks for.
export type NaturalLightFilter = Exclude<NaturalLight, "UNKNOWN">;

export type SpaceFilters = {
	q: string | null; // trimmed, whitespace collapsed, max 100 chars; "" → null
	cities: City[]; // empty = any city
	types: SpaceType[]; // empty = any type
	setting: SettingFilter | null;
	naturalLight: NaturalLightFilter[]; // empty = any, including UNKNOWN
	minCrew: number | null; // positive integer. Spaces with null maxCrew are excluded.
	hourlyRate: {
		// whole pesos, inclusive. If min > max, parse swaps them.
		// Either bound set excludes spaces with a null hourlyRate.
		min: number | null;
		max: number | null;
	};
	page: number; // 1-based, integer >= 1
};

// The raw shape Next.js hands a page as `await searchParams`.
export type RawSearchParams = Record<string, string | string[] | undefined>;

// Both live in app/_lib/spaceFilters.ts (pure, no server imports, so the page
// and client components can share them):
//   parseSpaceFilters(params: RawSearchParams): SpaceFilters
//   serializeSpaceFilters(filters: SpaceFilters): URLSearchParams
// Round-trip law: parse(serialize(f)) deep-equals f for any valid f.
export type ParseSpaceFilters = (params: RawSearchParams) => SpaceFilters;
export type SerializeSpaceFilters = (filters: SpaceFilters) => URLSearchParams;

// One page of browse results. Order is fixed: most recently listed first,
// then slug. No sort control in v1.
export type SpaceSearchResult = {
	spaces: SpaceCard[];
	total: number; // matches across all pages — the results count
	page: number; // echoes filters.page, even when past the last page
	pageSize: number; // fixed server-side at 12
	pageCount: number; // ceil(total / pageSize); 0 when total is 0
};

// ---------------------------------------------------------------- accounts

// The signed-in user, as they see themselves. Only ever describes the person
// holding the session cookie, never anyone else. Better Auth stores an empty
// name for magic-link sign-ups; the query layer maps "" to null.
export type CurrentUser = {
	id: string;
	email: string;
	name: string | null;
	host: { displayName: string } | null; // set when linked to a verified Host
};

// ---------------------------------------------------------------- inquiries
//
// An Inquiry is a conversation between one renter and the host of one space.
// Neither side ever sees the other's email or phone: names only.

// Which side of a thread the signed-in user is on.
export type InquiryRole = "RENTER" | "HOST";

// What the inquiry form posts. Dates are calendar dates in Manila, "YYYY-MM-DD".
export type NewInquiryInput = {
	spaceSlug: string;
	requesterName: string;
	requesterCompany: string | null;
	shootDate: string | null;
	durationHours: number | null;
	crewSize: number | null;
	productionType: ProductionType;
	budgetNote: string | null;
	message: string;
	website: string; // spam trap: hidden field, must be empty
};

export type InquiryMessage = {
	id: string;
	body: string;
	sentAt: string; // ISO 8601
	fromMe: boolean;
	senderName: string; // host displayName, or the inquiry's requesterName
};

// One row in /inbox.
export type InquirySummary = {
	id: string;
	role: InquiryRole;
	status: InquiryStatus;
	space: { slug: string; title: string };
	counterpartName: string;
	lastMessage: { body: string; sentAt: string; fromMe: boolean }; // body cut to INBOX_PREVIEW_CHARS
	unread: boolean;
};

// /inbox/[id]
export type InquiryThread = {
	id: string;
	role: InquiryRole;
	status: InquiryStatus;
	space: { slug: string; title: string; areaName: string; city: City };
	counterpartName: string;
	requesterCompany: string | null;
	shootDate: string | null; // "YYYY-MM-DD"
	durationHours: number | null;
	crewSize: number | null;
	productionType: ProductionType;
	budgetNote: string | null;
	messages: InquiryMessage[]; // oldest first
	canReply: boolean;
	canDecline: boolean;
	canClose: boolean;
};

// ---- API shapes (app/api/inquiries/**)

export type InquiryFieldErrors = Partial<Record<keyof NewInquiryInput, string>>;

export type InquiryApiError = {
	error: "UNAUTHENTICATED" | "VALIDATION" | "OWN_SPACE" | "NOT_FOUND" | "RATE_LIMITED" | "THREAD_CLOSED" | "NOT_HOST";
	fields?: InquiryFieldErrors;
};

// POST /api/inquiries — 201 new, 200 reused. id is null only for a spam-trap hit.
export type CreateInquiryResponse = { id: string | null; reused: boolean };

// POST /api/inquiries/[id]/messages — 201
export type PostMessageResponse = { message: InquiryMessage };

// GET /api/inquiries/[id]/messages?after=<messageId> — 200
export type MessagesResponse = { messages: InquiryMessage[]; status: InquiryStatus };

// POST /api/inquiries/[id]/status — 200
export type StatusResponse = { status: InquiryStatus };
