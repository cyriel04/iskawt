import { prisma } from "@/app/_lib/db";
import { normalizeEmail } from "@/app/_lib/server/signInLimit";

export type HostLinkResult = "linked" | "already-linked" | "no-match" | "ambiguous";

// Runs after every sign-in. Links the user to a Host when the magic link has
// proved they control that host's contactEmail, and only when a human has
// verified the host. Selects ids only: contact fields never leave the database.
export async function linkHostForUser(user: { id: string; email: string }): Promise<HostLinkResult> {
	const existing = await prisma.host.findFirst({ where: { userId: user.id }, select: { id: true } });
	if (existing) return "already-linked";

	const matches = await prisma.host.findMany({
		where: {
			contactEmail: { equals: normalizeEmail(user.email), mode: "insensitive" },
			verifiedAt: { not: null },
			userId: null,
		},
		select: { id: true },
		take: 2,
	});
	if (matches.length === 0) return "no-match";
	// Two hosts differing only by case: a human decides, not this code.
	if (matches.length > 1) return "ambiguous";

	// `userId: null` in the where keeps a concurrent sign-in from re-linking.
	// updateMany, not update: Prisma's unique where won't take `userId: null`
	// on a @unique column, and a lost race should be a count of 0, not a throw.
	const { count } = await prisma.host.updateMany({
		where: { id: matches[0].id, userId: null },
		data: { userId: user.id },
	});
	return count === 1 ? "linked" : "no-match";
}
