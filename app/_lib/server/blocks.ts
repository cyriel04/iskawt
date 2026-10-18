// Block and unblock the other side of a thread. Keyed by thread so no one ever
// handles the other user's id. Works on any thread you're in, open or not.
// Unblocking removes only your own block: with blocks both ways, the thread
// stays read-only until both are gone (see canSend in inquiryAccess.ts).

import { prisma } from "@/app/_lib/db";
import { getParticipation, type Participation } from "@/app/_lib/server/inquiryAccess";

export type BlockResult = { kind: "ok"; blockedByMe: boolean } | { kind: "not-found" } | { kind: "not-linked" };

// The host's side has no user until they sign in, so there is no one to block.
const counterpartOf = (p: Participation): string | null => (p.role === "RENTER" ? p.hostUserId : p.renterId);

export async function blockCounterpart(inquiryId: string, userId: string): Promise<BlockResult> {
	const p = await getParticipation(inquiryId, userId);
	if (!p) return { kind: "not-found" };
	const blockedId = counterpartOf(p);
	if (!blockedId) return { kind: "not-linked" };
	await prisma.block.upsert({
		where: { blockerId_blockedId: { blockerId: userId, blockedId } },
		create: { blockerId: userId, blockedId },
		update: {},
		select: { id: true },
	});
	return { kind: "ok", blockedByMe: true };
}

export async function unblockCounterpart(inquiryId: string, userId: string): Promise<BlockResult> {
	const p = await getParticipation(inquiryId, userId);
	if (!p) return { kind: "not-found" };
	const blockedId = counterpartOf(p);
	if (blockedId) await prisma.block.deleteMany({ where: { blockerId: userId, blockedId } });
	return { kind: "ok", blockedByMe: false };
}
