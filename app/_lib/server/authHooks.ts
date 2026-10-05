import { prisma } from "@/app/_lib/db";
import { MAGIC_LINK_REQUESTS_PER_IP_PER_HOUR, MAGIC_LINK_TTL_MINUTES } from "@/app/_lib/constants/limits";
import { getMailer } from "@/app/_lib/server/mailer";
import { magicLinkEmail } from "@/app/_lib/server/magicLinkEmail";
import { recordSignInRequest } from "@/app/_lib/server/signInLimit";
import { linkHostForUser } from "@/app/_lib/server/hostLink";

// Options and callback bodies for the Better Auth instance in auth.ts, kept
// here so Jest can test them without constructing it. Nothing here imports
// better-auth: its ESM build does not load under Jest.

// IP-keyed limit on the sign-in request route, stored in the database so it
// holds across serverless instances. The per-email limit is in signInLimit.ts.
export const rateLimitOptions = {
	enabled: true,
	storage: "database",
	customRules: { "/sign-in/magic-link": { window: 60 * 60, max: MAGIC_LINK_REQUESTS_PER_IP_PER_HOUR } },
} as const;

// Hashed: a leaked Verification table must not yield usable sign-in links.
// Only the stored token changes; the emailed link is the same.
export const magicLinkOptions = {
	expiresIn: MAGIC_LINK_TTL_MINUTES * 60,
	storeToken: "hashed",
} as const;

// databaseHooks.session.create.after. Best effort: a throw here would fail
// the sign-in after the one-time link has been consumed. Host linking is
// retried on the next sign-in anyway.
export async function onSessionCreated(session: { userId: string }): Promise<void> {
	try {
		const user = await prisma.user.findUnique({
			where: { id: session.userId },
			select: { id: true, email: true },
		});
		if (user) await linkHostForUser(user);
	} catch {
		// Fixed string and id only. Never the error: its message and query
		// parameters can carry the email address.
		console.error("[auth] host link failed", { userId: session.userId });
	}
}

export type SendMagicLinkResult = "sent" | "rate-limited";

// magicLink({ sendMagicLink }). auth.ts turns "rate-limited" into a 429
// APIError. A mailer failure rejects.
export async function sendMagicLinkEmail({ email, url }: { email: string; url: string }): Promise<SendMagicLinkResult> {
	if (!(await recordSignInRequest(email))) return "rate-limited";
	await getMailer().send(magicLinkEmail(email, url));
	return "sent";
}
