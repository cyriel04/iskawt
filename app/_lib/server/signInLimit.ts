import { prisma } from "@/app/_lib/db";
import { MAGIC_LINK_REQUESTS_PER_HOUR } from "@/app/_lib/constants/limits";

const HOUR_MS = 60 * 60 * 1000;

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

// Per-email cap on magic-link requests, so nobody can flood someone else's
// inbox. Better Auth's own limiter keys on IP and stays on as well.
export async function recordSignInRequest(email: string, now: Date = new Date()): Promise<boolean> {
	const normalized = normalizeEmail(email);
	const cutoff = new Date(now.getTime() - HOUR_MS);
	// Rows past the window no longer count and still hold an email address:
	// prune them for every address on each request, so the table stays bounded.
	await prisma.signInRequest.deleteMany({ where: { createdAt: { lt: cutoff } } });
	const recent = await prisma.signInRequest.count({
		where: { email: normalized, createdAt: { gt: cutoff } },
	});
	if (recent >= MAGIC_LINK_REQUESTS_PER_HOUR) return false;
	await prisma.signInRequest.create({ data: { email: normalized }, select: { id: true } });
	return true;
}
