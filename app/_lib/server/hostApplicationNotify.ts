// Tells ops a host application arrived. Runs from after(), so it never delays
// or fails the request. Ids, city, type and area only: the address, the
// applicant's name and email and the description are read in Prisma Studio.
// The route passes these fields from the validated input; nothing here reads
// the database, so the stored payload is never parsed back.

import { escapeHtml } from "@/app/_lib/server/escapeHtml";
import { getMailer, type MailMessage } from "@/app/_lib/server/mailer";
import { opsAddress } from "@/app/_lib/server/opsEmail";
import type { City, SpaceType } from "@/app/_lib/types";

export type HostApplicationNotice = {
	applicationId: string;
	spaceType: SpaceType;
	city: City;
	areaName: string;
	existingHost: boolean;
};

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ");

export function hostApplicationEmail({ to, applicationId, spaceType, city, areaName, existingHost }: HostApplicationNotice & { to: string }): MailMessage {
	const summary = `Application ${applicationId}: ${spaceType} in ${oneLine(areaName)}, ${city}.`;
	const lines = existingHost ? [summary, "Existing host."] : [summary];
	const footer = "Review in Prisma Studio.";
	return {
		to,
		subject: `New host application: ${city} ${spaceType}`,
		text: `${lines.join("\n")}\n\n${footer}`,
		html: [...lines, footer].map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
	};
}

export async function notifyHostApplication(notice: HostApplicationNotice, env: NodeJS.ProcessEnv = process.env): Promise<void> {
	try {
		const to = opsAddress(env);
		if (!to) {
			console.error("[host-application] no OPS_EMAIL_TO");
			return;
		}
		await getMailer().send(hostApplicationEmail({ ...notice, to }));
	} catch {
		console.error("[host-application] notify failed", { applicationId: notice.applicationId });
	}
}
