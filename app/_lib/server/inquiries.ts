// Reads for /inbox, /inbox/[id] and the thread poller. Participants only.

import { INBOX_PREVIEW_CHARS } from "@/app/_lib/constants/inquiries";
import { prisma } from "@/app/_lib/db";
import { getParticipation, isOpen, markRead, messageSelect, toInquiryMessage } from "@/app/_lib/server/inquiryAccess";
import type { InquirySummary, InquiryThread, MessagesResponse } from "@/app/_lib/types";

function preview(body: string): string {
	const chars = [...body];
	return chars.length > INBOX_PREVIEW_CHARS ? `${chars.slice(0, INBOX_PREVIEW_CHARS).join("")}…` : body;
}

export async function listInquiriesForUser(userId: string): Promise<InquirySummary[]> {
	const rows = await prisma.inquiry.findMany({
		where: { OR: [{ renterId: userId }, { space: { host: { userId } } }] },
		orderBy: [{ lastMessageAt: "desc" }, { id: "asc" }],
		select: {
			id: true,
			status: true,
			renterId: true,
			requesterName: true,
			lastMessageAt: true,
			hostLastReadAt: true,
			renterLastReadAt: true,
			space: { select: { slug: true, title: true, host: { select: { userId: true, displayName: true } } } },
			messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: messageSelect },
		},
	});

	return rows.flatMap((row) => {
		const last = row.messages[0];
		if (!last) return []; // every inquiry is created with a message; defensive
		const role = row.renterId === userId ? "RENTER" : "HOST";
		const lastRead = role === "HOST" ? row.hostLastReadAt : row.renterLastReadAt;
		const fromMe = last.senderId === userId;
		return [
			{
				id: row.id,
				role,
				status: row.status,
				space: { slug: row.space.slug, title: row.space.title },
				counterpartName: role === "RENTER" ? row.space.host.displayName : row.requesterName,
				lastMessage: { body: preview(last.body), sentAt: last.createdAt.toISOString(), fromMe },
				unread: !fromMe && (lastRead === null || row.lastMessageAt > lastRead),
			},
		];
	});
}

export async function getInquiryThread(
	inquiryId: string,
	userId: string,
	now: Date = new Date(),
): Promise<InquiryThread | null> {
	const p = await getParticipation(inquiryId, userId);
	if (!p) return null;

	const row = await prisma.inquiry.findUnique({
		where: { id: inquiryId },
		select: {
			id: true,
			status: true,
			requesterCompany: true,
			shootDate: true,
			durationHours: true,
			crewSize: true,
			productionType: true,
			budgetNote: true,
			space: { select: { slug: true, title: true, areaName: true, city: true } },
			messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: messageSelect },
		},
	});
	if (!row) return null;

	await markRead(inquiryId, p.role, now);
	const open = isOpen(row.status);
	return {
		id: row.id,
		role: p.role,
		status: row.status,
		space: row.space,
		counterpartName: p.role === "RENTER" ? p.hostDisplayName : p.requesterName,
		requesterCompany: row.requesterCompany,
		shootDate: row.shootDate ? row.shootDate.toISOString().slice(0, 10) : null,
		durationHours: row.durationHours,
		crewSize: row.crewSize,
		productionType: row.productionType,
		budgetNote: row.budgetNote,
		messages: row.messages.map((m) => toInquiryMessage(m, userId, p)),
		canReply: open,
		canDecline: open && p.role === "HOST",
		canClose: open,
	};
}

export async function getMessagesAfter(
	inquiryId: string,
	userId: string,
	after: string | null,
	now: Date = new Date(),
): Promise<MessagesResponse | null> {
	const p = await getParticipation(inquiryId, userId);
	if (!p) return null;

	// The cursor is looked up inside this inquiry only, so an id from another
	// thread is ignored rather than used.
	const cursor = after
		? await prisma.message.findFirst({ where: { id: after, inquiryId }, select: { id: true, createdAt: true } })
		: null;

	const rows = await prisma.message.findMany({
		where: cursor
			? {
					inquiryId,
					OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }],
				}
			: { inquiryId },
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		select: messageSelect,
	});

	await markRead(inquiryId, p.role, now);
	return { status: p.status, messages: rows.map((m) => toInquiryMessage(m, userId, p)) };
}
