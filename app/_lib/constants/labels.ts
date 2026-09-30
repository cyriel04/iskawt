// Display names for every enum a visitor can see. Plain data, no logic, shared
// by pages, components and the server search (which matches words against
// these names, so a wording change here changes search results too).
// Every map is a full Record, so a new enum value in schema.prisma fails
// typecheck here until it has a label.

import type {
	City,
	Level,
	NaturalLight,
	PowerAccess,
	ProductionType,
	Setting,
	SpaceType,
} from "@/app/_lib/types";

export const cityLabels: Record<City, string> = {
	CALOOCAN: "Caloocan",
	LAS_PINAS: "Las Piñas",
	MAKATI: "Makati",
	MALABON: "Malabon",
	MANDALUYONG: "Mandaluyong",
	MANILA: "Manila",
	MARIKINA: "Marikina",
	MUNTINLUPA: "Muntinlupa",
	NAVOTAS: "Navotas",
	PARANAQUE: "Parañaque",
	PASAY: "Pasay",
	PASIG: "Pasig",
	PATEROS: "Pateros",
	QUEZON_CITY: "Quezon City",
	SAN_JUAN: "San Juan",
	TAGUIG: "Taguig",
	VALENZUELA: "Valenzuela",
};

export const spaceTypeLabels: Record<SpaceType, string> = {
	APARTMENT: "Apartment",
	HOUSE: "House",
	STUDIO: "Studio",
	OFFICE: "Office",
	COWORKING: "Co-working space",
	WAREHOUSE: "Warehouse",
	RETAIL: "Retail",
	CAFE: "Café",
	RESTAURANT: "Restaurant",
	BAR: "Bar",
	ROOFTOP: "Rooftop",
	GARDEN: "Garden",
	POOL: "Pool",
	EVENT_SPACE: "Event space",
	GYM: "Gym",
	OTHER: "Other",
};

// Plural, for headings and page titles: "Studios in Makati".
export const spaceTypePluralLabels: Record<SpaceType, string> = {
	APARTMENT: "Apartments",
	HOUSE: "Houses",
	STUDIO: "Studios",
	OFFICE: "Offices",
	COWORKING: "Co-working spaces",
	WAREHOUSE: "Warehouses",
	RETAIL: "Retail spaces",
	CAFE: "Cafés",
	RESTAURANT: "Restaurants",
	BAR: "Bars",
	ROOFTOP: "Rooftops",
	GARDEN: "Gardens",
	POOL: "Pools",
	EVENT_SPACE: "Event spaces",
	GYM: "Gyms",
	OTHER: "Other spaces",
};

export const settingLabels: Record<Setting, string> = {
	INDOOR: "Indoor",
	OUTDOOR: "Outdoor",
	BOTH: "Indoor and outdoor",
};

export const naturalLightLabels: Record<NaturalLight, string> = {
	ABUNDANT: "Abundant",
	MODERATE: "Moderate",
	MINIMAL: "Minimal",
	NONE: "None",
	UNKNOWN: "Not stated",
};

export const powerAccessLabels: Record<PowerAccess, string> = {
	ON_SITE: "On site",
	LIMITED: "Limited",
	GENERATOR_REQUIRED: "Generator required",
	UNKNOWN: "Not stated",
};

export const levelLabels: Record<Level, string> = {
	LOW: "Low",
	MEDIUM: "Medium",
	HIGH: "High",
};

export const productionTypeLabels: Record<ProductionType, string> = {
	FILM: "Film",
	TV: "TV",
	MUSIC_VIDEO: "Music video",
	COMMERCIAL: "Commercial",
	DOCUMENTARY: "Documentary",
	PHOTOSHOOT: "Photoshoot",
	EVENT: "Event",
};
