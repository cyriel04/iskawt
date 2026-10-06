import { prisma } from "@/app/_lib/db";
import { normalizeEmail } from "@/app/_lib/server/signInLimit";

export type HostLinkResult = "linked" | "already-linked" | "no-match" | "ambiguous";

// Runs after every sign-in. Links the user to a Host when the magic link has
// proved they control that host's contactEmail, and only when a human has
// verified the host. Selects ids only: contact fields never leave the database.
export async function linkHostForUser(user: { id: string; email: string }): Promise<HostLinkResult> {
	const existing = await prisma.host.findFirst({ where: { userId: user.id }, select: { id: true } });
	if (existing) return "already-linked";

	// Raw SQL on purpose. Prisma's `mode: "insensitive"` compiles to an
	// unescaped ILIKE, where `_` and `%` are wildcards: maria_santos@... would
	// match maria.santos@... and take over that host. This is exact equality,
	// with the email as a bound parameter. Never $queryRawUnsafe, never concat.
	const normalized = normalizeEmail(user.email);
	const matches = await prisma.$queryRaw<{ id: string }[]>`
		SELECT "id" FROM "Host"
		WHERE lower(btrim("contactEmail")) = ${normalized}
			AND "verifiedAt" IS NOT NULL
			AND "userId" IS NULL
		LIMIT 2`;
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
