/** @jest-environment node */
const mockInquiryFindUnique = jest.fn();
const mockInquiryFindMany = jest.fn();
const mockInquiryUpdate = jest.fn();
const mockInquiryUpdateMany = jest.fn();
const mockMessageFindFirst = jest.fn();
const mockMessageFindMany = jest.fn();
const mockQueryRaw = jest.fn();

jest.mock("@/app/_lib/db", () => ({
	prisma: {
		inquiry: {
			findUnique: (...a: unknown[]) => mockInquiryFindUnique(...a),
			findMany: (...a: unknown[]) => mockInquiryFindMany(...a),
			update: (...a: unknown[]) => mockInquiryUpdate(...a),
			updateMany: (...a: unknown[]) => mockInquiryUpdateMany(...a),
		},
		message: {
			findFirst: (...a: unknown[]) => mockMessageFindFirst(...a),
			findMany: (...a: unknown[]) => mockMessageFindMany(...a),
		},
		$queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
	},
}));

import { getInquiryThread, getMessagesAfter, listInquiriesForUser } from "@/app/_lib/server/inquiries";
import { INBOX_PAGE_SIZE } from "@/app/_lib/constants/inquiries";

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

const PRIVATE_KEYS = /email|contactEmail|contactPhone|exactAddress|renterId|senderId|userId/i;

// Every key at every depth of a returned value, so a private field nested
// anywhere (space.host.contactEmail, messages[3].senderId) is caught.
function allKeys(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(allKeys);
	if (typeof value === "object" && value !== null && !(value instanceof Date)) {
		return Object.entries(value).flatMap(([key, child]) => [key, ...allKeys(child)]);
	}
	return [];
}

const readMarkFor = (side: "hostLastReadAt" | "renterLastReadAt", upTo: Date) => ({
	where: { id: "inq_1", OR: [{ [side]: null }, { [side]: { lt: upTo } }] },
	data: { [side]: upTo },
});

beforeEach(() => {
	jest.resetAllMocks();
	mockInquiryUpdateMany.mockResolvedValue({ count: 1 });
});

describe("participation", () => {
	it("returns null for a user who is neither renter nor host (no leak of existence)", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		await expect(getInquiryThread("inq_1", "user_stranger")).resolves.toBeNull();
		await expect(getMessagesAfter("inq_1", "user_stranger", null)).resolves.toBeNull();
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("returns null for an unknown inquiry", async () => {
		mockInquiryFindUnique.mockResolvedValue(null);
		await expect(getInquiryThread("nope", RENTER)).resolves.toBeNull();
	});

	it("never filters participation by publish state (unpublished spaces keep their threads)", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		mockMessageFindMany.mockResolvedValue([]);
		await getMessagesAfter("inq_1", RENTER, null);
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
		const thread = await getInquiryThread("inq_1", HOST);
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
		// Read up to the newest message shown, not the wall clock.
		expect(mockInquiryUpdateMany).toHaveBeenCalledTimes(1);
		expect(mockInquiryUpdateMany).toHaveBeenCalledWith(readMarkFor("hostLastReadAt", new Date("2026-10-06T09:00:00Z")));
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("for the renter: counterpart is the host's displayName, no decline, marks renter read", async () => {
		mockInquiryFindUnique.mockResolvedValueOnce({ ...participationRow, status: "RESPONDED" }).mockResolvedValueOnce(threadRow);
		const thread = await getInquiryThread("inq_1", RENTER);
		expect(thread).toMatchObject({ role: "RENTER", counterpartName: "Demo Host A", canDecline: false, canReply: true });
		expect(mockInquiryUpdateMany).toHaveBeenCalledWith(readMarkFor("renterLastReadAt", new Date("2026-10-06T09:00:00Z")));
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("writes no read mark for a thread with no messages", async () => {
		mockInquiryFindUnique.mockResolvedValueOnce(participationRow).mockResolvedValueOnce({ ...threadRow, messages: [] });
		await getInquiryThread("inq_1", HOST);
		expect(mockInquiryUpdateMany).not.toHaveBeenCalled();
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("a closed thread can't be replied to, declined or closed", async () => {
		mockInquiryFindUnique
			.mockResolvedValueOnce({ ...participationRow, status: "CLOSED" })
			.mockResolvedValueOnce({ ...threadRow, status: "CLOSED" });
		await expect(getInquiryThread("inq_1", HOST)).resolves.toMatchObject({
			canReply: false,
			canDecline: false,
			canClose: false,
		});
	});

	it("never selects or returns private fields", async () => {
		mockInquiryFindUnique.mockResolvedValueOnce(participationRow).mockResolvedValueOnce(threadRow);
		const thread = await getInquiryThread("inq_1", HOST);
		expect(thread).not.toBeNull();
		expect(allKeys(thread).join(" ")).not.toMatch(PRIVATE_KEYS);
		for (const [args] of mockInquiryFindUnique.mock.calls) {
			expect(JSON.stringify(args.select)).not.toMatch(/email|contact|exactAddress|"host":true/);
		}
	});
});

describe("getMessagesAfter", () => {
	it("returns every message when `after` is absent, and marks read", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		mockMessageFindMany.mockResolvedValue([msg("m1", RENTER, "2026-10-06T08:00:00Z")]);
		const result = await getMessagesAfter("inq_1", RENTER, null);
		expect(result).toEqual({
			status: "NEW",
			messages: [{ id: "m1", body: "Hello", sentAt: "2026-10-06T08:00:00.000Z", fromMe: true, senderName: "Demo Renter" }],
		});
		expect(mockMessageFindMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { inquiryId: "inq_1" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
		);
		expect(allKeys(result).join(" ")).not.toMatch(PRIVATE_KEYS);
	});

	it("marks read up to the newest message returned", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		mockMessageFindMany.mockResolvedValue([
			msg("m1", RENTER, "2026-10-06T08:00:00Z"),
			msg("m2", HOST, "2026-10-06T09:30:00Z"),
		]);
		await getMessagesAfter("inq_1", HOST, null);
		expect(mockInquiryUpdateMany).toHaveBeenCalledTimes(1);
		expect(mockInquiryUpdateMany).toHaveBeenCalledWith(readMarkFor("hostLastReadAt", new Date("2026-10-06T09:30:00Z")));
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("writes nothing when a poll returns no new messages", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		mockMessageFindFirst.mockResolvedValue({ id: "m1", createdAt: new Date("2026-10-06T08:00:00Z") });
		mockMessageFindMany.mockResolvedValue([]);
		await expect(getMessagesAfter("inq_1", RENTER, "m1")).resolves.toEqual({ status: "NEW", messages: [] });
		expect(mockInquiryUpdateMany).not.toHaveBeenCalled();
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("returns only newer messages when `after` belongs to this thread", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		mockMessageFindFirst.mockResolvedValue({ id: "m1", createdAt: new Date("2026-10-06T08:00:00Z") });
		mockMessageFindMany.mockResolvedValue([]);
		await getMessagesAfter("inq_1", RENTER, "m1");
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
		await getMessagesAfter("inq_1", RENTER, "m_other_thread");
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
		...over,
	});
	const last = (inquiryId: string, senderId: string, at: string, body = "Hello") => ({
		...msg(`m_${inquiryId}`, senderId, at, body),
		inquiryId,
	});

	it("queries threads where the user is renter or linked host, newest first, one page", async () => {
		mockInquiryFindMany.mockResolvedValue([]);
		await listInquiriesForUser(RENTER);
		const args = mockInquiryFindMany.mock.calls[0][0];
		expect(args.where).toEqual({ OR: [{ renterId: RENTER }, { space: { host: { userId: RENTER } } }] });
		expect(args.orderBy).toEqual([{ lastMessageAt: "desc" }, { id: "asc" }]);
		expect(INBOX_PAGE_SIZE).toBe(50);
		expect(args.take).toBe(INBOX_PAGE_SIZE);
	});

	it("never loads message bodies through the inquiry query (nested take emits no LIMIT)", async () => {
		mockInquiryFindMany.mockResolvedValue([]);
		await listInquiriesForUser(RENTER);
		expect(mockInquiryFindMany.mock.calls[0][0].select).not.toHaveProperty("messages");
	});

	it("never selects private host or space fields", async () => {
		mockInquiryFindMany.mockResolvedValue([]);
		await listInquiriesForUser(RENTER);
		expect(JSON.stringify(mockInquiryFindMany.mock.calls[0][0].select)).not.toMatch(/email|contact|exactAddress|"host":true/i);
	});

	it("skips the preview query when there are no threads", async () => {
		mockInquiryFindMany.mockResolvedValue([]);
		await expect(listInquiriesForUser(RENTER)).resolves.toEqual([]);
		expect(mockQueryRaw).not.toHaveBeenCalled();
	});

	it("fetches the latest message per thread with one parameterised DISTINCT ON query", async () => {
		mockInquiryFindMany.mockResolvedValue([row({}), row({ id: "inq_2" })]);
		mockQueryRaw.mockResolvedValue([]);
		await listInquiriesForUser(RENTER);
		expect(mockQueryRaw).toHaveBeenCalledTimes(1);
		const [strings, ...values] = mockQueryRaw.mock.calls[0];
		const sql = (strings as readonly string[]).join("$?").replace(/\s+/g, " ");
		expect(sql).toContain('SELECT DISTINCT ON ("inquiryId")');
		expect(sql).toContain('FROM "Message"');
		expect(sql).toContain('WHERE "inquiryId" = ANY($?)');
		expect(sql).toContain('ORDER BY "inquiryId", "createdAt" DESC, "id" DESC');
		expect(sql).not.toContain("inq_1");
		expect(values).toEqual([["inq_1", "inq_2"]]);
	});

	it("maps a row for the renter: unread when the host wrote after the renter last read; preview truncated", async () => {
		mockInquiryFindMany.mockResolvedValue([row({})]);
		mockQueryRaw.mockResolvedValue([last("inq_1", HOST, "2026-10-06T09:00:00Z", "x".repeat(200))]);
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

	it("matches previews to threads by inquiryId and keeps the inquiry order", async () => {
		mockInquiryFindMany.mockResolvedValue([row({ id: "inq_2" }), row({})]);
		mockQueryRaw.mockResolvedValue([
			last("inq_1", HOST, "2026-10-06T08:00:00Z", "one"),
			last("inq_2", HOST, "2026-10-06T09:00:00Z", "two"),
		]);
		const summaries = await listInquiriesForUser(RENTER);
		expect(summaries.map((s) => [s.id, s.lastMessage.body])).toEqual([
			["inq_2", "two"],
			["inq_1", "one"],
		]);
	});

	it("is not unread when the latest message is your own", async () => {
		mockInquiryFindMany.mockResolvedValue([row({})]);
		mockQueryRaw.mockResolvedValue([last("inq_1", RENTER, "2026-10-06T09:00:00Z")]);
		const [summary] = await listInquiriesForUser(RENTER);
		expect(summary.unread).toBe(false);
	});

	it("for the host: counterpart is requesterName, unread when never read", async () => {
		mockInquiryFindMany.mockResolvedValue([row({})]);
		mockQueryRaw.mockResolvedValue([last("inq_1", RENTER, "2026-10-06T09:00:00Z")]);
		const [summary] = await listInquiriesForUser(HOST);
		expect(summary).toMatchObject({ role: "HOST", counterpartName: "Demo Renter", unread: true });
	});

	it("drops a thread with no message (defensive; every inquiry is created with one)", async () => {
		mockInquiryFindMany.mockResolvedValue([row({})]);
		mockQueryRaw.mockResolvedValue([]);
		await expect(listInquiriesForUser(RENTER)).resolves.toEqual([]);
	});

	it("never returns private keys at any depth", async () => {
		mockInquiryFindMany.mockResolvedValue([row({})]);
		mockQueryRaw.mockResolvedValue([last("inq_1", HOST, "2026-10-06T09:00:00Z")]);
		const summaries = await listInquiriesForUser(RENTER);
		expect(summaries).toHaveLength(1);
		expect(allKeys(summaries).join(" ")).not.toMatch(PRIVATE_KEYS);
	});
});
