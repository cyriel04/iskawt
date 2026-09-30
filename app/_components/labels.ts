// Formatting helpers for public Space data. The display names themselves live
// in app/_lib/constants/labels.ts.

import { cityLabels, naturalLightLabels } from "@/app/_lib/constants/labels";
import type { City, IndicativeRates, NaturalLight } from "@/app/_lib/types";

const peso = new Intl.NumberFormat("en-PH", {
	style: "currency",
	currency: "PHP",
	minimumFractionDigits: 0,
	maximumFractionDigits: 0,
});

export function formatPeso(amount: number): string {
	return peso.format(amount);
}

// The public location of a space. Area and city only — never an address.
export function locationLine(areaName: string, city: City): string {
	return `${areaName}, ${cityLabels[city]}`;
}

export type HeadlineRate = { amount: number; unit: "hour" | "half day" | "full day" };

// The single rate a card leads with: hourly, else half day, else full day.
export function headlineRate(rates: IndicativeRates): HeadlineRate | null {
	if (rates.hourly !== null) return { amount: rates.hourly, unit: "hour" };
	if (rates.halfDay !== null) return { amount: rates.halfDay, unit: "half day" };
	if (rates.fullDay !== null) return { amount: rates.fullDay, unit: "full day" };
	return null;
}

export function lightSummary(light: NaturalLight): string | null {
	if (light === "UNKNOWN") return null;
	if (light === "NONE") return "No natural light";
	return `${naturalLightLabels[light]} light`;
}
