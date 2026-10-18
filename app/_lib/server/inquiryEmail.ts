// The "new message" notification. The space title (reviewed by a human) and a
// link only. Nothing a user typed, not their name and not their message, so an
// email from the Iskawt domain can't carry someone posing as Iskawt.

import { SITE_NAME } from "@/app/_lib/constants/site";
import { escapeHtml } from "@/app/_lib/server/escapeHtml";
import type { MailMessage } from "@/app/_lib/server/mailer";

type Args = {
	to: string;
	spaceTitle: string;
	url: string;
	hostNotLinked: boolean;
};

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ");

export function inquiryMessageEmail({ to, spaceTitle, url, hostNotLinked }: Args): MailMessage {
	const intro = `You have a new message about ${spaceTitle}.`;
	const cta = hostNotLinked ? "Sign in with this email address to read and reply" : `Reply on ${SITE_NAME}`;
	const safety = `${SITE_NAME} never asks for passwords or payment, by email or in messages.`;
	const footer = `Replies to this email aren't delivered. Reply on ${SITE_NAME} instead.`;
	return {
		to,
		subject: `New message about ${oneLine(spaceTitle)}`,
		text: `${intro}\n\n${cta}: ${url}\n\n${safety}\n\n${footer}`,
		html:
			`<p>${escapeHtml(intro)}</p>` +
			`<p><a href="${escapeHtml(url)}">${escapeHtml(cta)}</a></p>` +
			`<p>${escapeHtml(safety)}</p>` +
			`<p>${escapeHtml(footer)}</p>`,
	};
}
