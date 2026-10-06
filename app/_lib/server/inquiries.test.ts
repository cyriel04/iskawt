/** @jest-environment node */
const mockInquiryFindUnique = jest.fn();
const mockInquiryFindMany = jest.fn();
const mockInquiryUpdate = jest.fn();
const mockMessageFindFirst = jest.fn();
const mockMessageFindMany = jest.fn();

jest.mock("@/app/_lib/db", () => ({
	prisma: {
		inquiry: {
			findUnique: (...a: unknown[]) => mockInquiryFindUnique(...a),
			findMany: (...a: unknown[]) => mockInquiryFindMany(...a),
			update: (...a: unknown[]) => mockInquiryUpdate(...a),
		},
		message: {
			findFirst: (...a: unknown[]) => mockMessageFindFirst(...a),
			findMany: (...a: unknown[]) => mockMessageFindMany(...a),
		},
	},
}));

import { getInquiryThread, getMessagesAfter, listInquiriesForUser } from "@/app/_lib/server/inquiries";

const now = new Date("2026-10-06T10:00:00Z");
const RENTER = "user_renter";
const HOST = "user_host";

// DEMO rows shaped like the participation select.
const participationRow = {
	id: "inq_1",
	status: "NEW",
	renterId: RENTER,
	requesterName: "Demo Renter",
	space: { host: { userId: HOST, displayName: "Demo Host A" } },
};
const msg = (id: string, senderId: string, at: string, body = "Hello") => ({
	id,
	body,
	senderId,
	createdAt: new Date(at),
});

const PRIVATE_KEYS = /email|contactEmail|contactPhone|exactAddress|renterId|senderId|userId/;

beforeEach(() => jest.resetAllMocks());

describe("participation", () => {
	it("returns null for a user who is neither renter nor host (no leak of existence)", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		await expect(getInquiryThread("inq_1", "user_stranger", now)).resolves.toBeNull();
		await expect(getMessagesAfter("inq_1", "user_stranger", null, now)).resolves.toBeNull();
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("returns null for an unknown inquiry", async () => {
		mockInquiryFindUnique.mockResolvedValue(null);
		await expect(getInquiryThread("nope", RENTER, now)).resolves.toBeNull();
	});

	it("never filters participation by publish state (unpublished spaces keep their threads)", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		mockMessageFindMany.mockResolvedValue([]);
		await getMessagesAfter("inq_1", RENTER, null, now);
		const where = mockInquiryFindUnique.mock.calls[0][0].where;
		expect(where).toEqual({ id: "inq_1" });
	});
});

describe("getInquiryThread", () => {
	const threadRow = {
		id: "inq_1",
		status: "RESPONDED",
		requesterCompany: "Demo Films",
		shootDate: new Date("2026-10-20T00:00:00Z"),
		durationHours: 6,
		crewSize: 12,
		productionType: "COMMERCIAL",
		budgetNote: null,
		space: { slug: "demo-poblacion-loft", title: "[DEMO] Corner loft", areaName: "Poblacion", city: "MAKATI" },
		messages: [msg("m1", RENTER, "2026-10-06T08:00:00Z", "Free on the 20th?"), msg("m2", HOST, "2026-10-06T09:00:00Z", "Yes")],
	};

	it("maps the thread for the host: renter shown by requesterName, host can decline", async () => {
		mockInquiryFindUnique.mockResolvedValueOnce({ ...participationRow, status: "RESPONDED" }).mockResolvedValueOnce(threadRow);
		const thread = await getInquiryThread("inq_1", HOST, now);
		expect(thread).toEqual({
			id: "inq_1",
			role: "HOST",
			status: "RESPONDED",
			space: { slug: "demo-poblacion-loft", title: "[DEMO] Corner loft", areaName: "Poblacion", city: "MAKATI" },
			counterpartName: "Demo Renter",
			requesterCompany: "Demo Films",
			shootDate: "2026-10-20",
			durationHours: 6,
			crewSize: 12,
			productionType: "COMMERCIAL",
			budgetNote: null,
			messages: [
				{ id: "m1", body: "Free on the 20th?", sentAt: "2026-10-06T08:00:00.000Z", fromMe: false, senderName: "Demo Renter" },
				{ id: "m2", body: "Yes", sentAt: "2026-10-06T09:00:00.000Z", fromMe: true, senderName: "Demo Host A" },
			],
			canReply: true,
			canDecline: true,
			canClose: true,
		});
		expect(mockInquiryUpdate).toHaveBeenCalledWith({
			where: { id: "inq_1" },
			data: { hostLastReadAt: now },
			select: { id: true },
		});
	});

	it("for the renter: counterpart is the host's displayName, no decline, marks renter read", async () => {
		mockInquiryFindUnique.mockResolvedValueOnce({ ...participationRow, status: "RESPONDED" }).mockResolvedValueOnce(threadRow);
		const thread = await getInquiryThread("inq_1", RENTER, now);
		expect(thread).toMatchObject({ role: "RENTER", counterpartName: "Demo Host A", canDecline: false, canReply: true });
		expect(mockInquiryUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { renterLastReadAt: now } }));
	});

	it("a closed thread can't be replied to, declined or closed", async () => {
		mockInquiryFindUnique
			.mockResolvedValueOnce({ ...participationRow, status: "CLOSED" })
			.mockResolvedValueOnce({ ...threadRow, status: "CLOSED" });
		await expect(getInquiryThread("inq_1", HOST, now)).resolves.toMatchObject({
			canReply: false,
			canDecline: false,
			canClose: false,
		});
	});

	it("never selects or returns private fields", async () => {
		mockInquiryFindUnique.mockResolvedValueOnce(participationRow).mockResolvedValueOnce(threadRow);
		const thread = await getInquiryThread("inq_1", HOST, now);
		expect(Object.keys(thread ?? {}).join(" ")).not.toMatch(PRIVATE_KEYS);
		for (const m of thread?.messages ?? []) expect(Object.keys(m).join(" ")).not.toMatch(PRIVATE_KEYS);
		for (const [args] of mockInquiryFindUnique.mock.calls) {
			expect(JSON.stringify(args.select)).not.toMatch(/email|contact|exactAddress|"host":true/);
		}
	});
});

describe("getMessagesAfter", () => {
	it("returns every message when `after` is absent, and marks read", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		mockMessageFindMany.mockResolvedValue([msg("m1", RENTER, "2026-10-06T08:00:00Z")]);
		const result = await getMessagesAfter("inq_1", RENTER, null, now);
		expect(result).toEqual({
			status: "NEW",
			messages: [{ id: "m1", body: "Hello", sentAt: "2026-10-06T08:00:00.000Z", fromMe: true, senderName: "Demo Renter" }],
		});
		expect(mockMessageFindMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { inquiryId: "inq_1" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
		);
	});

	it("returns only newer messages when `after` belongs to this thread", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		mockMessageFindFirst.mockResolvedValue({ id: "m1", createdAt: new Date("2026-10-06T08:00:00Z") });
		mockMessageFindMany.mockResolvedValue([]);
		await getMessagesAfter("inq_1", RENTER, "m1", now);
		expect(mockMessageFindFirst).toHaveBeenCalledWith({
			where: { id: "m1", inquiryId: "inq_1" },
			select: { id: true, createdAt: true },
		});
		expect(mockMessageFindMany.mock.calls[0][0].where).toEqual({
			inquiryId: "inq_1",
			OR: [
				{ createdAt: { gt: new Date("2026-10-06T08:00:00Z") } },
				{ createdAt: new Date("2026-10-06T08:00:00Z"), id: { gt: "m1" } },
			],
		});
	});

	it("ignores an `after` id from another thread (cursor lookup is scoped to this inquiry)", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		mockMessageFindFirst.mockResolvedValue(null);
		mockMessageFindMany.mockResolvedValue([]);
		await getMessagesAfter("inq_1", RENTER, "m_other_thread", now);
		expect(mockMessageFindMany.mock.calls[0][0].where).toEqual({ inquiryId: "inq_1" });
	});
});

describe("listInquiriesForUser", () => {
	const row = (over: Record<string, unknown>) => ({
		id: "inq_1",
		status: "NEW",
		renterId: RENTER,
		requesterName: "Demo Renter",
		lastMessageAt: new Date("2026-10-06T09:00:00Z"),
		hostLastReadAt: null,
		renterLastReadAt: new Date("2026-10-06T08:00:00Z"),
		space: { slug: "demo-poblacion-loft", title: "[DEMO] Corner loft", host: { userId: HOST, displayName: "Demo Host A" } },
		messages: [msg("m2", HOST, "2026-10-06T09:00:00Z", "x".repeat(200))],
		...over,
	});

	it("queries threads where the user is renter or linked host, newest first", async () => {
		mockInquiryFindMany.mockResolvedValue([]);
		await listInquiriesForUser(RENTER);
		const args = mockInquiryFindMany.mock.calls[0][0];
		expect(args.where).toEqual({ OR: [{ renterId: RENTER }, { space: { host: { userId: RENTER } } }] });
		expect(args.orderBy).toEqual([{ lastMessageAt: "desc" }, { id: "asc" }]);
	});

	it("maps a row for the renter: unread when the host wrote after the renter last read; preview truncated", async () => {
		mockInquiryFindMany.mockResolvedValue([row({})]);
		const [summary] = await listInquiriesForUser(RENTER);
		expect(summary).toEqual({
			id: "inq_1",
			role: "RENTER",
			status: "NEW",
			space: { slug: "demo-poblacion-loft", title: "[DEMO] Corner loft" },
			counterpartName: "Demo Host A",
			lastMessage: { body: `${"x".repeat(140)}…`, sentAt: "2026-10-06T09:00:00.000Z", fromMe: false },
			unread: true,
		});
	});

	it("is not unread when the latest message is your own", async () => {
		mockInquiryFindMany.mockResolvedValue([row({ messages: [msg("m3", RENTER, "2026-10-06T09:00:00Z")] })]);
		const [summary] = await listInquiriesForUser(RENTER);
		expect(summary.unread).toBe(false);
	});

	it("for the host: counterpart is requesterName, unread when never read", async () => {
		mockInquiryFindMany.mockResolvedValue([row({ messages: [msg("m1", RENTER, "2026-10-06T09:00:00Z")] })]);
		const [summary] = await listInquiriesForUser(HOST);
		expect(summary).toMatchObject({ role: "HOST", counterpartName: "Demo Renter", unread: true });
	});

	it("never returns private keys", async () => {
		mockInquiryFindMany.mockResolvedValue([row({})]);
		const [summary] = await listInquiriesForUser(RENTER);
		expect(JSON.stringify(Object.keys(summary)) + JSON.stringify(Object.keys(summary.lastMessage))).not.toMatch(PRIVATE_KEYS);
	});
});
