import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { cache } from "react";
import { prisma } from "@/app/_lib/db";
import { auth } from "@/app/_lib/server/auth";
import type { CurrentUser } from "@/app/_lib/types";

// The signed-in user, for their own header and pages. Explicit select: the
// Host relation must never carry contactEmail or contactPhone. Wrapped in
// cache() so the layout and page share one lookup per request. Sets Sentry's
// user to the opaque id only, never the email or name.
export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser | null> {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) {
		Sentry.setUser(null);
		return null;
	}

	const row = await prisma.user.findUnique({
		where: { id: session.user.id },
		select: { id: true, email: true, name: true, host: { select: { displayName: true, verifiedAt: true } } },
	});
	if (!row) {
		Sentry.setUser(null);
		return null;
	}

	Sentry.setUser({ id: row.id });
	return {
		id: row.id,
		email: row.email,
		name: row.name.trim() === "" ? null : row.name,
		host: row.host && row.host.verifiedAt ? { displayName: row.host.displayName } : null,
	};
});
