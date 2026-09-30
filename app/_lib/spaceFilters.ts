// Browse filters <-> URL search params. Pure: no server imports, so the page,
// server components and client components all share it. The URL shape is
// documented on SpaceFilters in app/_lib/types.ts.

import { City, NaturalLight, SpaceType } from "@/generated/prisma/enums";
import type {
	NaturalLightFilter,
	ParseSpaceFilters,
	RawSearchParams,
	SerializeSpaceFilters,
	SettingFilter,
	SpaceFilters,
} from "@/app/_lib/types";

export const EMPTY_FILTERS: SpaceFilters = {
	q: null,
	cities: [],
	types: [],
	setting: null,
	naturalLight: [],
	minCrew: null,
	hourlyRate: { min: null, max: null },
	page: 1,
};

const Q_MAX = 100;

// The URL form of an enum value: MAKATI → makati, QUEZON_CITY → quezon-city.
export function paramValue(value: string): string {
	return value.toLowerCase().replace(/_/g, "-");
}

// Code-point order on the URL form, so parse and serialise agree exactly.
function byParam(a: string, b: string): number {
	const x = paramValue(a);
	const y = paramValue(b);
	return x < y ? -1 : x > y ? 1 : 0;
}

function sortedValues<T extends string>(values: readonly T[]): readonly T[] {
	return [...values].sort(byParam);
}

// Every value a renter can ask for, in URL (alphabetical) order.
export const CITY_VALUES: readonly City[] = sortedValues(Object.values(City));
export const SPACE_TYPE_VALUES: readonly SpaceType[] = sortedValues(Object.values(SpaceType));
export const SETTING_VALUES: readonly SettingFilter[] = ["INDOOR", "OUTDOOR"];
export const LIGHT_VALUES: readonly NaturalLightFilter[] = sortedValues(
	Object.values(NaturalLight).filter((v): v is NaturalLightFilter => v !== "UNKNOWN"),
);

function lookup<T extends string>(values: readonly T[]): Map<string, T> {
	return new Map(values.map((v) => [paramValue(v), v]));
}

const cityByParam = lookup(CITY_VALUES);
const typeByParam = lookup(SPACE_TYPE_VALUES);
const settingByParam = lookup(SETTING_VALUES);
const lightByParam = lookup(LIGHT_VALUES);

function all(raw: string | string[] | undefined): string[] {
	if (raw === undefined) return [];
	return Array.isArray(raw) ? raw : [raw];
}

function first(raw: string | string[] | undefined): string | undefined {
	return all(raw)[0];
}

// Known values only, deduplicated, in URL order. Anything else is dropped.
function enumList<T extends string>(raw: string | string[] | undefined, known: Map<string, T>): T[] {
	const found = new Set<T>();
	for (const value of all(raw)) {
		const match = known.get(value);
		if (match !== undefined) found.add(match);
	}
	return [...found].sort(byParam);
}

// Digits only, at least 1, and exactly representable. "2.5", "-1", "1e3" → null.
function positiveInt(raw: string | string[] | undefined): number | null {
	const value = first(raw);
	if (value === undefined || !/^\d+$/.test(value)) return null;
	const n = Number(value);
	return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

function searchText(raw: string | string[] | undefined): string | null {
	const value = first(raw);
	if (value === undefined) return null;
	const text = value.replace(/\s+/g, " ").trim().slice(0, Q_MAX).trimEnd();
	return text === "" ? null : text;
}

export const parseSpaceFilters: ParseSpaceFilters = (params: RawSearchParams): SpaceFilters => {
	const settingParam = first(params.setting);
	let min = positiveInt(params.rateMin);
	let max = positiveInt(params.rateMax);
	if (min !== null && max !== null && min > max) [min, max] = [max, min];

	return {
		q: searchText(params.q),
		cities: enumList(params.city, cityByParam),
		types: enumList(params.type, typeByParam),
		setting: (settingParam !== undefined && settingByParam.get(settingParam)) || null,
		naturalLight: enumList(params.light, lightByParam),
		minCrew: positiveInt(params.crew),
		hourlyRate: { min, max },
		page: positiveInt(params.page) ?? 1,
	};
};

export const serializeSpaceFilters: SerializeSpaceFilters = (filters: SpaceFilters): URLSearchParams => {
	const params = new URLSearchParams();
	const appendAll = (key: string, values: readonly string[]) => {
		for (const value of [...new Set(values)].sort(byParam)) params.append(key, paramValue(value));
	};

	if (filters.q !== null) params.append("q", filters.q);
	appendAll("city", filters.cities);
	appendAll("type", filters.types);
	if (filters.setting !== null) params.append("setting", paramValue(filters.setting));
	appendAll("light", filters.naturalLight);
	if (filters.minCrew !== null) params.append("crew", String(filters.minCrew));
	if (filters.hourlyRate.min !== null) params.append("rateMin", String(filters.hourlyRate.min));
	if (filters.hourlyRate.max !== null) params.append("rateMax", String(filters.hourlyRate.max));
	if (filters.page > 1) params.append("page", String(filters.page));
	return params;
};

// The browse URL for a set of filters: "/" or "/?city=makati&…".
export function spacesHref(filters: SpaceFilters): string {
	const query = serializeSpaceFilters(filters).toString();
	return query === "" ? "/" : `/?${query}`;
}

// Whether anything narrows the results. The page number alone does not.
export function hasActiveFilters(filters: SpaceFilters): boolean {
	return (
		filters.q !== null ||
		filters.cities.length > 0 ||
		filters.types.length > 0 ||
		filters.setting !== null ||
		filters.naturalLight.length > 0 ||
		filters.minCrew !== null ||
		filters.hourlyRate.min !== null ||
		filters.hourlyRate.max !== null
	);
}
