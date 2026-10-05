import { SITE_NAME } from "@/app/_lib/constants/site";
import { MAGIC_LINK_TTL_MINUTES } from "@/app/_lib/constants/limits";
import type { MailMessage } from "@/app/_lib/server/mailer";

function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function magicLinkEmail(to: string, url: string): MailMessage {
	const expiry = `This link works once and expires in ${MAGIC_LINK_TTL_MINUTES} minutes.`;
	const ignore = "If you didn't ask to sign in, you can ignore this email.";
	return {
		to,
		subject: `Sign in to ${SITE_NAME}`,
		text: `Sign in to ${SITE_NAME}:\n${url}\n\n${expiry}\n${ignore}`,
		html: `<p><a href="${escapeHtml(url)}">Sign in to ${SITE_NAME}</a></p><p>${expiry}</p><p>${ignore}</p>`,
	};
}
