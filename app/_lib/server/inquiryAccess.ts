// Who is on which side of an inquiry. Every read and write asks here first.
// A user who is neither the renter nor the host's linked user gets null, and
// callers turn that into 404, so the existence of a thread is never revealed.
// Participation deliberately ignores the space's publish state: an unpublished
// listing keeps its conversations.

import { prisma } from "@/app/_lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { InquiryMessage, InquiryRole, InquiryStatus } from "@/app/_lib/types";

export type Participation = {
	id: string;
	status: InquiryStatus;
	role: InquiryRole;
	renterId: string;
	requesterName: string;
	hostDisplayName: string;
};

const participationSelect = {
	id: true,
	status: true,
	renterId: true,
	requesterName: true,
	space: { select: { host: { select: { userId: true, displayName: true } } } },
} satisfies Prisma.InquirySelect;

export const messageSelect = { id: true, body: true, createdAt: true, senderId: true } satisfies Prisma.MessageSelect;

export async function getParticipation(inquiryId: string, userId: string): Promise<Participation | null> {
	const row = await prisma.inquiry.findUnique({ where: { id: inquiryId }, select: participationSelect });
	if (!row) return null;
	const role: InquiryRole | null =
		row.renterId === userId ? "RENTER" : row.space.host.userId === userId ? "HOST" : null;
	if (!role) return null;
	return {
		id: row.id,
		status: row.status,
		role,
		renterId: row.renterId,
		requesterName: row.requesterName,
		hostDisplayName: row.space.host.displayName,
	};
}

export function isOpen(status: InquiryStatus): boolean {
	return status === "NEW" || status === "RESPONDED";
}

export function toInquiryMessage(
	row: { id: string; body: string; createdAt: Date; senderId: string },
	viewerId: string,
	p: Pick<Participation, "renterId" | "requesterName" | "hostDisplayName">,
): InquiryMessage {
	return {
		id: row.id,
		body: row.body,
		sentAt: row.createdAt.toISOString(),
		fromMe: row.senderId === viewerId,
		senderName: row.senderId === p.renterId ? p.requesterName : p.hostDisplayName,
	};
}

// Marks the reader's side read up to `upTo`, the newest message they have now
// been shown. Never moves the mark backwards, and skips the write when it is
// already there, so a poll that returns nothing new costs no write.
export async function markRead(inquiryId: string, role: InquiryRole, upTo: Date): Promise<void> {
	const args: Prisma.InquiryUpdateManyArgs =
		role === "HOST"
			? {
					where: { id: inquiryId, OR: [{ hostLastReadAt: null }, { hostLastReadAt: { lt: upTo } }] },
					data: { hostLastReadAt: upTo },
				}
			: {
					where: { id: inquiryId, OR: [{ renterLastReadAt: null }, { renterLastReadAt: { lt: upTo } }] },
					data: { renterLastReadAt: upTo },
				};
	await prisma.inquiry.updateMany(args);
}
