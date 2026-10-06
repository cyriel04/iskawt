// The "new message" notification. Names, the space title and the message
// only: never anyone's email address or phone.

import { SITE_NAME } from "@/app/_lib/constants/site";
import { escapeHtml } from "@/app/_lib/server/escapeHtml";
import type { MailMessage } from "@/app/_lib/server/mailer";

type Args = {
	to: string;
	spaceTitle: string;
	senderName: string;
	body: string;
	url: string;
	hostNotLinked: boolean;
};

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ");

export function inquiryMessageEmail({ to, spaceTitle, senderName, body, url, hostNotLinked }: Args): MailMessage {
	const cta = hostNotLinked ? "Sign in with this email address to read and reply" : `Reply on ${SITE_NAME}`;
	const footer = `Replies to this email aren't delivered. Reply on ${SITE_NAME} instead.`;
	return {
		to,
		subject: `New message about ${oneLine(spaceTitle)}`,
		text: `${senderName} wrote about ${spaceTitle}:\n\n${body}\n\n${cta}: ${url}\n\n${footer}`,
		html:
			`<p>${escapeHtml(senderName)} wrote about ${escapeHtml(spaceTitle)}:</p>` +
			`<p>${escapeHtml(body).replace(/\r?\n/g, "<br>")}</p>` +
			`<p><a href="${escapeHtml(url)}">${escapeHtml(cta)}</a></p>` +
			`<p>${escapeHtml(footer)}</p>`,
	};
}
