import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { prisma } from "@/app/_lib/db";
import { MAGIC_LINK_REQUESTS_PER_HOUR, MAGIC_LINK_TTL_MINUTES } from "@/app/_lib/constants/limits";
import { getMailer } from "@/app/_lib/server/mailer";
import { magicLinkEmail } from "@/app/_lib/server/magicLinkEmail";
import { recordSignInRequest } from "@/app/_lib/server/signInLimit";
import { linkHostForUser } from "@/app/_lib/server/hostLink";

export const auth = betterAuth({
	database: prismaAdapter(prisma, { provider: "postgresql" }),
	// IP-keyed limit on the sign-in request route, stored in the database so it
	// holds across serverless instances. The per-email limit is in signInLimit.ts.
	rateLimit: {
		enabled: true,
		storage: "database",
		customRules: { "/sign-in/magic-link": { window: 60 * 60, max: MAGIC_LINK_REQUESTS_PER_HOUR } },
	},
	databaseHooks: {
		session: {
			create: {
				after: async (session) => {
					const user = await prisma.user.findUnique({
						where: { id: session.userId },
						select: { id: true, email: true },
					});
					if (user) await linkHostForUser(user);
				},
			},
		},
	},
	plugins: [
		magicLink({
			expiresIn: MAGIC_LINK_TTL_MINUTES * 60,
			sendMagicLink: async ({ email, url }) => {
				if (!(await recordSignInRequest(email))) {
					throw new APIError("TOO_MANY_REQUESTS", { message: "Too many sign-in requests. Try again in an hour." });
				}
				await getMailer().send(magicLinkEmail(email, url));
			},
		}),
		nextCookies(), // must stay last
	],
});
