// Reports on a thread, for a human to review in Prisma Studio. A report never
// blocks, closes or hides anything. Detail is private to ops: never logged.

import { REPORTS_PER_USER_PER_DAY } from "@/app/_lib/constants/inquiries";
import { prisma } from "@/app/_lib/db";
import { getParticipation } from "@/app/_lib/server/inquiryAccess";
import type { NewReportInput } from "@/app/_lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReportResult = { kind: "created"; id: string } | { kind: "not-found" } | { kind: "rate-limited" };

export async function createReport(
	inquiryId: string,
	userId: string,
	input: NewReportInput,
	now: Date = new Date(),
): Promise<ReportResult> {
	if (!(await getParticipation(inquiryId, userId))) return { kind: "not-found" };
	const recent = await prisma.report.count({
		where: { reporterId: userId, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
	});
	if (recent >= REPORTS_PER_USER_PER_DAY) return { kind: "rate-limited" };
	const created = await prisma.report.create({
		data: { reporterId: userId, inquiryId, reason: input.reason, detail: input.detail },
		select: { id: true },
	});
	return { kind: "created", id: created.id };
}
