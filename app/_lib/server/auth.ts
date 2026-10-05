import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { prisma } from "@/app/_lib/db";
import {
	magicLinkOptions,
	onSessionCreated,
	rateLimitOptions,
	sendMagicLinkEmail,
} from "@/app/_lib/server/authHooks";

export const auth = betterAuth({
	database: prismaAdapter(prisma, { provider: "postgresql" }),
	// Client IP comes from Vercel's headers. A non-Vercel deploy must set advanced.ipAddress.ipAddressHeaders.
	rateLimit: rateLimitOptions,
	databaseHooks: {
		session: {
			create: {
				after: async (session) => {
					await onSessionCreated(session);
				},
			},
		},
	},
	plugins: [
		magicLink({
			...magicLinkOptions,
			sendMagicLink: async ({ email, url }) => {
				if ((await sendMagicLinkEmail({ email, url })) === "rate-limited") {
					throw new APIError("TOO_MANY_REQUESTS", { message: "Too many sign-in requests. Try again in an hour." });
				}
			},
		}),
		nextCookies(), // must stay last
	],
});
