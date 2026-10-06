// Writes for inquiries: create (or reuse the open thread), post a message,
// decline or close. Expected outcomes are returned, not thrown; the route
// handlers map them to status codes.

import { INQUIRIES_PER_USER_PER_DAY, MESSAGES_PER_USER_PER_HOUR } from "@/app/_lib/constants/inquiries";
import { prisma } from "@/app/_lib/db";
import { getParticipation, isOpen, messageSelect, toInquiryMessage } from "@/app/_lib/server/inquiryAccess";
import { publishedWhere } from "@/app/_lib/server/spaces";
import { Prisma } from "@/generated/prisma/client";
import type { InquiryMessage, InquiryRole, InquiryStatus, NewInquiryInput } from "@/app/_lib/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type CreateResult =
	| { kind: "created"; id: string }
	| { kind: "reused"; id: string }
	| { kind: "not-found" }
	| { kind: "own-space" }
	| { kind: "rate-limited" };

export type PostResult =
	| { kind: "sent"; message: InquiryMessage; role: InquiryRole }
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
	// create two. The loser gets P2034 and is retried once, by which time the
	// winner's thread exists and the retry appends to it.
	const run = () => prisma.$transaction(
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

	try {
		return await run();
	} catch (error) {
		if (isSerializationConflict(error)) return run();
		throw error;
	}
}

function isSerializationConflict(error: unknown): boolean {
	return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
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

	// The open-status guard is re-checked inside the write: a close or decline
	// that lands after getParticipation must win, not be overwritten.
	const row = await prisma.$transaction(async (tx) => {
		const touched = await tx.inquiry.updateMany({
			where: { id: inquiryId, status: { in: OPEN_STATUSES } },
			data: p.role === "HOST" ? { lastMessageAt: now, hostLastReadAt: now } : { lastMessageAt: now, renterLastReadAt: now },
		});
		if (touched.count === 0) return null;
		if (p.role === "HOST") {
			await tx.inquiry.updateMany({ where: { id: inquiryId, status: "NEW" }, data: { status: "RESPONDED" } });
		}
		return tx.message.create({
			data: { inquiryId, senderId: userId, body, createdAt: now },
			select: messageSelect,
		});
	});
	if (!row) return { kind: "closed" };

	return { kind: "sent", message: toInquiryMessage(row, userId, p), role: p.role };
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

	const status: InquiryStatus = action === "decline" ? "DECLINED" : "CLOSED";
	const updated = await prisma.inquiry.updateMany({
		where: { id: inquiryId, status: { in: OPEN_STATUSES } },
		data: { status },
	});
	if (updated.count === 0) return { kind: "closed" };
	return { kind: "ok", status };
}
