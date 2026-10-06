// Writes for inquiries: create (or reuse the open thread), post a message,
// decline or close. Expected outcomes are returned, not thrown; the route
// handlers map them to status codes.

import { INQUIRIES_PER_USER_PER_DAY, MESSAGES_PER_USER_PER_HOUR } from "@/app/_lib/constants/inquiries";
import { prisma } from "@/app/_lib/db";
import { getParticipation, isOpen, messageSelect, toInquiryMessage } from "@/app/_lib/server/inquiryAccess";
import { publishedWhere } from "@/app/_lib/server/spaces";
import type { InquiryMessage, InquiryStatus, NewInquiryInput } from "@/app/_lib/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type CreateResult =
	| { kind: "created"; id: string }
	| { kind: "reused"; id: string }
	| { kind: "not-found" }
	| { kind: "own-space" }
	| { kind: "rate-limited" };

export type PostResult =
	| { kind: "sent"; message: InquiryMessage }
	| { kind: "not-found" }
	| { kind: "closed" }
	| { kind: "rate-limited" };

export type StatusResult =
	| { kind: "ok"; status: InquiryStatus }
	| { kind: "not-found" }
	| { kind: "closed" }
	| { kind: "not-host" };

const OPEN_STATUSES: InquiryStatus[] = ["NEW", "RESPONDED"];

export async function createInquiry(userId: string, input: NewInquiryInput, now: Date = new Date()): Promise<CreateResult> {
	const space = await prisma.space.findFirst({
		where: { slug: input.spaceSlug, ...publishedWhere },
		select: { id: true, host: { select: { userId: true } } },
	});
	if (!space) return { kind: "not-found" };
	if (space.host.userId === userId) return { kind: "own-space" };

	// Serializable: two parallel submits can't both see "no open thread" and
	// create two. The loser throws P2034 and the route returns 500.
	return prisma.$transaction(
		async (tx): Promise<CreateResult> => {
			const open = await tx.inquiry.findFirst({
				where: { spaceId: space.id, renterId: userId, status: { in: OPEN_STATUSES } },
				select: { id: true },
			});

			if (open) {
				const sent = await tx.message.count({
					where: { senderId: userId, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
				});
				if (sent >= MESSAGES_PER_USER_PER_HOUR) return { kind: "rate-limited" };
				await tx.message.create({
					data: { inquiryId: open.id, senderId: userId, body: input.message, createdAt: now },
					select: { id: true },
				});
				await tx.inquiry.update({
					where: { id: open.id },
					data: { lastMessageAt: now, renterLastReadAt: now },
					select: { id: true },
				});
				return { kind: "reused", id: open.id };
			}

			const recent = await tx.inquiry.count({
				where: { renterId: userId, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
			});
			if (recent >= INQUIRIES_PER_USER_PER_DAY) return { kind: "rate-limited" };

			const created = await tx.inquiry.create({
				data: {
					spaceId: space.id,
					renterId: userId,
					requesterName: input.requesterName,
					requesterCompany: input.requesterCompany,
					shootDate: input.shootDate ? new Date(`${input.shootDate}T00:00:00.000Z`) : null,
					durationHours: input.durationHours,
					crewSize: input.crewSize,
					productionType: input.productionType,
					budgetNote: input.budgetNote,
					lastMessageAt: now,
					renterLastReadAt: now,
					messages: { create: { senderId: userId, body: input.message, createdAt: now } },
				},
				select: { id: true },
			});
			return { kind: "created", id: created.id };
		},
		{ isolationLevel: "Serializable" },
	);
}

export async function postMessage(
	inquiryId: string,
	userId: string,
	body: string,
	now: Date = new Date(),
): Promise<PostResult> {
	const p = await getParticipation(inquiryId, userId);
	if (!p) return { kind: "not-found" };
	if (!isOpen(p.status)) return { kind: "closed" };

	const sent = await prisma.message.count({
		where: { senderId: userId, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
	});
	if (sent >= MESSAGES_PER_USER_PER_HOUR) return { kind: "rate-limited" };

	const row = await prisma.$transaction(async (tx) => {
		const created = await tx.message.create({
			data: { inquiryId, senderId: userId, body, createdAt: now },
			select: messageSelect,
		});
		await tx.inquiry.update({
			where: { id: inquiryId },
			data:
				p.role === "HOST"
					? { lastMessageAt: now, hostLastReadAt: now, ...(p.status === "NEW" ? { status: "RESPONDED" as const } : {}) }
					: { lastMessageAt: now, renterLastReadAt: now },
			select: { id: true },
		});
		return created;
	});

	return { kind: "sent", message: toInquiryMessage(row, userId, p) };
}

export async function changeStatus(
	inquiryId: string,
	userId: string,
	action: "decline" | "close",
): Promise<StatusResult> {
	const p = await getParticipation(inquiryId, userId);
	if (!p) return { kind: "not-found" };
	if (!isOpen(p.status)) return { kind: "closed" };
	if (action === "decline" && p.role !== "HOST") return { kind: "not-host" };

	const updated = await prisma.inquiry.update({
		where: { id: inquiryId },
		data: { status: action === "decline" ? "DECLINED" : "CLOSED" },
		select: { status: true },
	});
	return { kind: "ok", status: updated.status };
}
