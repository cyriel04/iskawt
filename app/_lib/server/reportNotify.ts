// Tells ops a report was filed. Runs from after(), so it never delays or fails
// the request. Ids and the reason only: the reporter's detail is read in
// Prisma Studio, never emailed or logged.

import { prisma } from "@/app/_lib/db";
import { escapeHtml } from "@/app/_lib/server/escapeHtml";
import { getMailer, type MailMessage } from "@/app/_lib/server/mailer";
import type { ReportReason } from "@/app/_lib/types";

type Args = { to: string; reportId: string; inquiryId: string; reason: ReportReason };

export function reportEmail({ to, reportId, inquiryId, reason }: Args): MailMessage {
	const lines = [`Report ${reportId} on inquiry ${inquiryId}.`, `Reason: ${reason}`, "Review in Prisma Studio."];
	return {
		to,
		subject: `Report: ${reason}`,
		text: `${lines[0]}\n${lines[1]}\n\n${lines[2]}`,
		html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
	};
}

export async function notifyReport(reportId: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
	try {
		const to = env.REPORTS_EMAIL_TO;
		if (!to) {
			console.error("[report] no REPORTS_EMAIL_TO");
			return;
		}
		const row = await prisma.report.findUnique({ where: { id: reportId }, select: { id: true, inquiryId: true, reason: true } });
		if (!row) return;
		await getMailer().send(reportEmail({ to, reportId: row.id, inquiryId: row.inquiryId, reason: row.reason }));
	} catch {
		console.error("[report] notify failed", { reportId });
	}
}
