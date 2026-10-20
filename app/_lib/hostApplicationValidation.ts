// Validation for host applications. Pure, with no server imports, so the route
// and the "List your space" form share exactly the same rules.

import {
	APPLICATION_ADDRESS_MAX,
	APPLICATION_AREA_MAX,
	APPLICATION_DESCRIPTION_MAX,
	APPLICATION_DESCRIPTION_MIN,
	APPLICATION_RATE_MAX,
} from "@/app/_lib/constants/hostApplications";
import { INQUIRY_NAME_MAX } from "@/app/_lib/constants/inquiries";
import { looksOfficial } from "@/app/_lib/inquiryValidation";
import { City, SpaceType } from "@/generated/prisma/enums";
import type { HostApplicationFieldErrors, NewHostApplicationInput } from "@/app/_lib/types";

const CITIES: readonly string[] = Object.values(City);
const SPACE_TYPES: readonly string[] = Object.values(SpaceType);
const isCity = (value: unknown): value is City => typeof value === "string" && CITIES.includes(value);
const isSpaceType = (value: unknown): value is SpaceType => typeof value === "string" && SPACE_TYPES.includes(value);

const chars = (value: string) => [...value].length; // code points, not UTF-16 units
const tooLong = (max: number) => `Keep it under ${max} characters.`;
const UNSUPPORTED = "Remove unsupported characters.";

// A required text field: trimmed; empty, a non-string, NUL or too long is an error.
function requiredText(value: unknown, empty: string, max: number): { value: string; error: string | null } {
	if (typeof value !== "string") return { value: "", error: empty };
	if (value.includes("\u0000")) return { value: "", error: UNSUPPORTED };
	const trimmed = value.trim();
	if (!trimmed) return { value: "", error: empty };
	if (chars(trimmed) > max) return { value: trimmed, error: tooLong(max) };
	return { value: trimmed, error: null };
}

function rate(value: unknown): number | null | "invalid" {
	if (value === null || value === undefined || value === "") return null;
	const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
	return Number.isInteger(n) && n >= 1 && n <= APPLICATION_RATE_MAX ? n : "invalid";
}

export function validateNewHostApplication(
	input: unknown,
): { ok: true; value: NewHostApplicationInput } | { ok: false; errors: HostApplicationFieldErrors } {
	const raw: Record<string, unknown> =
		typeof input === "object" && input !== null && !Array.isArray(input) ? { ...input } : {};
	const errors: HostApplicationFieldErrors = {};

	const name = requiredText(raw.applicantName, "Enter your name.", INQUIRY_NAME_MAX);
	if (name.error) errors.applicantName = name.error;
	else if (looksOfficial(name.value)) errors.applicantName = "Use your own name or your business's name.";

	if (!isSpaceType(raw.spaceType)) errors.spaceType = "Choose a space type.";
	if (!isCity(raw.city)) errors.city = "Choose a city.";

	const area = requiredText(raw.areaName, "Enter the area, like Poblacion or Kapitolyo.", APPLICATION_AREA_MAX);
	if (area.error) errors.areaName = area.error;

	const address = requiredText(raw.address, "Enter the address.", APPLICATION_ADDRESS_MAX);
	if (address.error) errors.address = address.error;

	const description = requiredText(raw.description, "Describe the space.", APPLICATION_DESCRIPTION_MAX);
	if (description.error) errors.description = description.error;
	else if (chars(description.value) < APPLICATION_DESCRIPTION_MIN) {
		errors.description = `Tell us a little more about the space (at least ${APPLICATION_DESCRIPTION_MIN} characters).`;
	}

	const hourlyRate = rate(raw.hourlyRate);
	if (hourlyRate === "invalid") errors.hourlyRate = "Enter a whole number of pesos.";

	if (raw.confirmsRightToList !== true) errors.confirmsRightToList = "Confirm that this space is yours to list.";

	const website = typeof raw.website === "string" ? raw.website.trim() : "";

	if (
		Object.keys(errors).length > 0 ||
		!isSpaceType(raw.spaceType) ||
		!isCity(raw.city) ||
		hourlyRate === "invalid" ||
		raw.confirmsRightToList !== true
	) {
		return { ok: false, errors };
	}
	return {
		ok: true,
		value: {
			applicantName: name.value,
			spaceType: raw.spaceType,
			city: raw.city,
			areaName: area.value,
			address: address.value,
			description: description.value,
			hourlyRate,
			confirmsRightToList: true,
			website,
		},
	};
}
