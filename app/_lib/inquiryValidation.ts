// Validation for inquiries and messages. Pure, with no server imports, so the
// route handlers and the inquiry form share exactly the same rules.

import { CREW_MAX } from "@/app/_lib/constants/limits";
import {
	INQUIRY_BUDGET_NOTE_MAX,
	INQUIRY_COMPANY_MAX,
	INQUIRY_DURATION_HOURS_MAX,
	INQUIRY_NAME_MAX,
	MESSAGE_BODY_MAX,
	SHOOT_DATE_MAX_DAYS_AHEAD,
} from "@/app/_lib/constants/inquiries";
import { ProductionType } from "@/generated/prisma/enums";
import type { InquiryFieldErrors, NewInquiryInput } from "@/app/_lib/types";

const PRODUCTION_TYPES: readonly string[] = Object.values(ProductionType);

function isProductionType(value: string): value is ProductionType {
	return PRODUCTION_TYPES.includes(value);
}

// Today's calendar date in Manila, "YYYY-MM-DD".
export function manilaToday(now: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}

function addDays(date: string, days: number): string {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// The shoot-date window the validator accepts, for the form's date input.
export function shootDateRange(today: string): { min: string; max: string } {
	return { min: today, max: addDays(today, SHOOT_DATE_MAX_DAYS_AHEAD) };
}

function isRealDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [y, m, d] = value.split("-").map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const chars = (value: string) => [...value].length; // code points, not UTF-16 units
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const tooLong = (max: number) => `Keep it under ${max} characters.`;

// Postgres can't store NUL in a text column; letting one through is a 500.
const UNSUPPORTED = "Remove unsupported characters.";
const hasNul = (value: string) => value.includes("\u0000");

// Absent (null/undefined) is null. Present but not a string is an error, not a
// silent null, so a client bug can't drop a field the renter filled in.
function optionalText(value: unknown, wrongType: string): { value: string | null; error: string | null } {
	if (value === null || value === undefined) return { value: null, error: null };
	if (typeof value !== "string") return { value: null, error: wrongType };
	if (hasNul(value)) return { value: null, error: UNSUPPORTED };
	return { value: value.trim() || null, error: null };
}

function optionalInt(value: unknown): number | null | "invalid" {
	if (value === null || value === undefined || value === "") return null;
	const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
	return Number.isInteger(n) ? n : "invalid";
}

export function validateMessageBody(body: unknown): { ok: true; value: string } | { ok: false; error: string } {
	const value = text(body);
	if (!value) return { ok: false, error: "Write a message." };
	if (hasNul(value)) return { ok: false, error: UNSUPPORTED };
	if (chars(value) > MESSAGE_BODY_MAX) return { ok: false, error: tooLong(MESSAGE_BODY_MAX) };
	return { ok: true, value };
}

export function validateNewInquiry(
	input: unknown,
	today: string,
): { ok: true; value: NewInquiryInput } | { ok: false; errors: InquiryFieldErrors } {
	const raw: Record<string, unknown> = typeof input === "object" && input !== null ? { ...input } : {};
	const errors: InquiryFieldErrors = {};

	const spaceSlug = text(raw.spaceSlug);
	if (!spaceSlug) errors.spaceSlug = "Missing space.";
	else if (hasNul(spaceSlug)) errors.spaceSlug = UNSUPPORTED;

	const requesterName = text(raw.requesterName);
	if (!requesterName) errors.requesterName = "Enter your name.";
	else if (hasNul(requesterName)) errors.requesterName = UNSUPPORTED;
	else if (chars(requesterName) > INQUIRY_NAME_MAX) errors.requesterName = tooLong(INQUIRY_NAME_MAX);

	const company = optionalText(raw.requesterCompany, "Enter text.");
	const requesterCompany = company.value;
	if (company.error) errors.requesterCompany = company.error;
	else if (requesterCompany && chars(requesterCompany) > INQUIRY_COMPANY_MAX) errors.requesterCompany = tooLong(INQUIRY_COMPANY_MAX);

	const date = optionalText(raw.shootDate, "Enter a valid date.");
	const shootDate = date.value;
	if (date.error) errors.shootDate = date.error;
	else if (shootDate !== null) {
		if (!isRealDate(shootDate)) errors.shootDate = "Enter a valid date.";
		else if (shootDate < today) errors.shootDate = "Pick today or a later date.";
		else if (shootDate > addDays(today, SHOOT_DATE_MAX_DAYS_AHEAD)) errors.shootDate = "Pick a date within the next year.";
	}

	const durationHours = optionalInt(raw.durationHours);
	if (durationHours === "invalid" || (durationHours !== null && (durationHours < 1 || durationHours > INQUIRY_DURATION_HOURS_MAX))) {
		errors.durationHours = `Enter whole hours from 1 to ${INQUIRY_DURATION_HOURS_MAX}.`;
	}

	const crewSize = optionalInt(raw.crewSize);
	if (crewSize === "invalid" || (crewSize !== null && (crewSize < 1 || crewSize > CREW_MAX))) {
		errors.crewSize = `Enter a crew size from 1 to ${CREW_MAX}.`;
	}

	const productionType = text(raw.productionType);
	if (hasNul(productionType)) errors.productionType = UNSUPPORTED;
	else if (!isProductionType(productionType)) errors.productionType = "Choose a production type.";

	const note = optionalText(raw.budgetNote, "Enter text.");
	const budgetNote = note.value;
	if (note.error) errors.budgetNote = note.error;
	else if (budgetNote && chars(budgetNote) > INQUIRY_BUDGET_NOTE_MAX) errors.budgetNote = tooLong(INQUIRY_BUDGET_NOTE_MAX);

	const message = validateMessageBody(raw.message);
	if (!message.ok) errors.message = message.error;

	if (
		Object.keys(errors).length > 0 ||
		!message.ok ||
		durationHours === "invalid" ||
		crewSize === "invalid" ||
		!isProductionType(productionType)
	) {
		return { ok: false, errors };
	}
	return {
		ok: true,
		value: {
			spaceSlug,
			requesterName,
			requesterCompany,
			shootDate,
			durationHours,
			crewSize,
			productionType,
			budgetNote,
			message: message.value,
			website: text(raw.website),
		},
	};
}
