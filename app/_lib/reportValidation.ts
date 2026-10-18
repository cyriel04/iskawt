// Validation for reports. Pure, with no server imports, so the route and the
// report dialog share the same rules.

import { REPORT_DETAIL_MAX } from "@/app/_lib/constants/inquiries";
import { ReportReason } from "@/generated/prisma/enums";
import type { NewReportInput, ReportFieldErrors } from "@/app/_lib/types";

const REASONS: readonly string[] = Object.values(ReportReason);
const isReason = (value: unknown): value is ReportReason => typeof value === "string" && REASONS.includes(value);

export function validateNewReport(
	input: unknown,
): { ok: true; value: NewReportInput } | { ok: false; errors: ReportFieldErrors } {
	const raw: Record<string, unknown> = typeof input === "object" && input !== null ? { ...input } : {};
	const errors: ReportFieldErrors = {};

	const reason = raw.reason;
	if (!isReason(reason)) errors.reason = "Choose a reason.";

	let detail: string | null = null;
	if (raw.detail !== null && raw.detail !== undefined) {
		if (typeof raw.detail !== "string") errors.detail = "Enter text.";
		else if (raw.detail.includes("\u0000")) errors.detail = "Remove unsupported characters.";
		else {
			detail = raw.detail.trim() || null;
			if (detail && [...detail].length > REPORT_DETAIL_MAX) errors.detail = `Keep it under ${REPORT_DETAIL_MAX} characters.`;
		}
	}

	if (!isReason(reason) || Object.keys(errors).length > 0) return { ok: false, errors };
	return { ok: true, value: { reason, detail } };
}
