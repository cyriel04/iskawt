/** @jest-environment node */
const mockSpaceFindFirst = jest.fn();
const mockInquiryFindUnique = jest.fn();
const mockInquiryFindFirst = jest.fn();
const mockInquiryCount = jest.fn();
const mockInquiryCreate = jest.fn();
const mockInquiryUpdate = jest.fn();
const mockInquiryUpdateMany = jest.fn();
const mockMessageCount = jest.fn();
const mockMessageCreate = jest.fn();
const mockTransaction = jest.fn();

const db = {
	space: { findFirst: (...a: unknown[]) => mockSpaceFindFirst(...a) },
	inquiry: {
		findUnique: (...a: unknown[]) => mockInquiryFindUnique(...a),
		findFirst: (...a: unknown[]) => mockInquiryFindFirst(...a),
		count: (...a: unknown[]) => mockInquiryCount(...a),
		create: (...a: unknown[]) => mockInquiryCreate(...a),
		update: (...a: unknown[]) => mockInquiryUpdate(...a),
		updateMany: (...a: unknown[]) => mockInquiryUpdateMany(...a),
	},
	message: {
		count: (...a: unknown[]) => mockMessageCount(...a),
		create: (...a: unknown[]) => mockMessageCreate(...a),
	},
};
// jest.mock is hoisted above `const db`, so the factory reads it lazily.
jest.mock("@/app/_lib/db", () => ({
	prisma: {
		get space() {
			return db.space;
		},
		get inquiry() {
			return db.inquiry;
		},
		get message() {
			return db.message;
		},
		$transaction: (...a: unknown[]) => mockTransaction(...a),
	},
}));

import { changeStatus, createInquiry, postMessage } from "@/app/_lib/server/inquiryWrites";
import { Prisma } from "@/generated/prisma/client";
import { INQUIRIES_PER_USER_PER_DAY, MESSAGES_PER_USER_PER_HOUR } from "@/app/_lib/constants/inquiries";
import type { NewInquiryInput } from "@/app/_lib/types";

const now = new Date("2026-10-06T10:00:00Z");
const RENTER = "user_renter";
const HOST = "user_host";
const input: NewInquiryInput = {
	spaceSlug: "demo-poblacion-loft",
	requesterName: "Demo Renter",
	requesterCompany: null,
	shootDate: "2026-10-20",
	durationHours: 6,
	crewSize: 12,
	productionType: "COMMERCIAL",
	budgetNote: null,
	message: "Free on the 20th?",
	website: "",
};
const participationRow = (status = "NEW") => ({
	id: "inq_1",
	status,
	renterId: RENTER,
	requesterName: "Demo Renter",
	space: { host: { userId: HOST, displayName: "Demo Host A" } },
});

beforeEach(() => {
	jest.resetAllMocks();
	// Run the transaction callback against the same mocks.
	mockTransaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
	mockSpaceFindFirst.mockResolvedValue({ id: "space_1", host: { userId: HOST } });
	mockInquiryFindFirst.mockResolvedValue(null);
	mockInquiryCount.mockResolvedValue(0);
	mockMessageCount.mockResolvedValue(0);
	mockInquiryCreate.mockResolvedValue({ id: "inq_new" });
	mockInquiryUpdateMany.mockResolvedValue({ count: 1 });
	mockMessageCreate.mockResolvedValue({ id: "m9", body: "Hi", senderId: RENTER, createdAt: now });
});

describe("createInquiry", () => {
	it("creates the inquiry and its first message for a published space", async () => {
		await expect(createInquiry(RENTER, input, now)).resolves.toEqual({ kind: "created", id: "inq_new" });
		expect(mockSpaceFindFirst).toHaveBeenCalledWith({
			where: { slug: "demo-poblacion-loft", status: "PUBLISHED", host: { verifiedAt: { not: null } } },
			select: { id: true, host: { select: { userId: true } } },
		});
		expect(mockInquiryCreate).toHaveBeenCalledWith({
			data: {
				spaceId: "space_1",
				renterId: RENTER,
				requesterName: "Demo Renter",
				requesterCompany: null,
				shootDate: new Date("2026-10-20T00:00:00.000Z"),
				durationHours: 6,
				crewSize: 12,
				productionType: "COMMERCIAL",
				budgetNote: null,
				lastMessageAt: now,
				renterLastReadAt: now,
				messages: { create: { senderId: RENTER, body: "Free on the 20th?", createdAt: now } },
			},
			select: { id: true },
		});
	});

	it("runs in a serializable transaction so two parallel submits can't open two threads", async () => {
		await createInquiry(RENTER, input, now);
		expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
	});

	it("returns not-found for an unpublished or unknown space", async () => {
		mockSpaceFindFirst.mockResolvedValue(null);
		await expect(createInquiry(RENTER, input, now)).resolves.toEqual({ kind: "not-found" });
		expect(mockInquiryCreate).not.toHaveBeenCalled();
	});

	it("refuses a host inquiring about their own space", async () => {
		await expect(createInquiry(HOST, input, now)).resolves.toEqual({ kind: "own-space" });
	});

	it("reuses the renter's open thread for the same space and appends the message", async () => {
		mockInquiryFindFirst.mockResolvedValue({ id: "inq_open" });
		await expect(createInquiry(RENTER, input, now)).resolves.toEqual({ kind: "reused", id: "inq_open" });
		expect(mockInquiryFindFirst).toHaveBeenCalledWith({
			where: { spaceId: "space_1", renterId: RENTER, status: { in: ["NEW", "RESPONDED"] } },
			select: { id: true },
		});
		expect(mockMessageCreate).toHaveBeenCalledWith({
			data: { inquiryId: "inq_open", senderId: RENTER, body: "Free on the 20th?", createdAt: now },
			select: { id: true },
		});
		expect(mockInquiryUpdate).toHaveBeenCalledWith({
			where: { id: "inq_open" },
			data: { lastMessageAt: now, renterLastReadAt: now },
			select: { id: true },
		});
		expect(mockInquiryCreate).not.toHaveBeenCalled();
	});

	it("rate-limits new inquiries per user per day", async () => {
		mockInquiryCount.mockResolvedValue(INQUIRIES_PER_USER_PER_DAY);
		await expect(createInquiry(RENTER, input, now)).resolves.toEqual({ kind: "rate-limited" });
		expect(mockInquiryCount).toHaveBeenCalledWith({
			where: { renterId: RENTER, createdAt: { gt: new Date("2026-10-05T10:00:00Z") } },
		});
		expect(mockInquiryCreate).not.toHaveBeenCalled();
	});

	it("rate-limits a reused thread by the per-hour message limit", async () => {
		mockInquiryFindFirst.mockResolvedValue({ id: "inq_open" });
		mockMessageCount.mockResolvedValue(MESSAGES_PER_USER_PER_HOUR);
		await expect(createInquiry(RENTER, input, now)).resolves.toEqual({ kind: "rate-limited" });
		expect(mockMessageCreate).not.toHaveBeenCalled();
	});

	const conflict = () => new Prisma.PrismaClientKnownRequestError("Transaction conflict", { code: "P2034", clientVersion: "7" });

	it("retries the transaction once on a serialization conflict (P2034), still serializable", async () => {
		mockTransaction
			.mockRejectedValueOnce(conflict())
			.mockImplementationOnce((fn: (tx: typeof db) => unknown) => fn(db));
		mockInquiryFindFirst.mockResolvedValue({ id: "inq_open" });
		await expect(createInquiry(RENTER, input, now)).resolves.toEqual({ kind: "reused", id: "inq_open" });
		expect(mockTransaction).toHaveBeenCalledTimes(2);
		for (const call of mockTransaction.mock.calls) {
			expect(call[1]).toEqual({ isolationLevel: "Serializable" });
		}
	});

	it("rethrows when the retry conflicts too", async () => {
		mockTransaction.mockRejectedValueOnce(conflict()).mockRejectedValueOnce(conflict());
		await expect(createInquiry(RENTER, input, now)).rejects.toMatchObject({ code: "P2034" });
		expect(mockTransaction).toHaveBeenCalledTimes(2);
	});

	it("does not retry other errors", async () => {
		mockTransaction.mockRejectedValueOnce(
			new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002", clientVersion: "7" }),
		);
		await expect(createInquiry(RENTER, input, now)).rejects.toMatchObject({ code: "P2002" });
		expect(mockTransaction).toHaveBeenCalledTimes(1);
	});
});

describe("postMessage", () => {
	it("returns not-found for a non-participant", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow());
		await expect(postMessage("inq_1", "user_stranger", "Hi", now)).resolves.toEqual({ kind: "not-found" });
		expect(mockMessageCreate).not.toHaveBeenCalled();
	});

	it("refuses a closed or declined thread", async () => {
		for (const status of ["CLOSED", "DECLINED"]) {
			mockInquiryFindUnique.mockResolvedValue(participationRow(status));
			await expect(postMessage("inq_1", RENTER, "Hi", now)).resolves.toEqual({ kind: "closed" });
		}
		expect(mockMessageCreate).not.toHaveBeenCalled();
	});

	it("rate-limits messages per user per hour", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow());
		mockMessageCount.mockResolvedValue(MESSAGES_PER_USER_PER_HOUR);
		await expect(postMessage("inq_1", RENTER, "Hi", now)).resolves.toEqual({ kind: "rate-limited" });
		expect(mockMessageCount).toHaveBeenCalledWith({
			where: { senderId: RENTER, createdAt: { gt: new Date("2026-10-06T09:00:00Z") } },
		});
	});

	it("host's first reply moves NEW to RESPONDED and marks the host read, all guarded on the thread being open", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("NEW"));
		mockMessageCreate.mockResolvedValue({ id: "m9", body: "Yes", senderId: HOST, createdAt: now });
		await expect(postMessage("inq_1", HOST, "Yes", now)).resolves.toEqual({
			kind: "sent",
			message: { id: "m9", body: "Yes", sentAt: now.toISOString(), fromMe: true, senderName: "Demo Host A" },
		});
		expect(mockInquiryUpdateMany).toHaveBeenNthCalledWith(1, {
			where: { id: "inq_1", status: { in: ["NEW", "RESPONDED"] } },
			data: { lastMessageAt: now, hostLastReadAt: now },
		});
		expect(mockInquiryUpdateMany).toHaveBeenNthCalledWith(2, {
			where: { id: "inq_1", status: "NEW" },
			data: { status: "RESPONDED" },
		});
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("renter's message keeps the status and marks the renter read", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("NEW"));
		await postMessage("inq_1", RENTER, "Hi", now);
		expect(mockInquiryUpdateMany).toHaveBeenCalledTimes(1);
		expect(mockInquiryUpdateMany).toHaveBeenCalledWith({
			where: { id: "inq_1", status: { in: ["NEW", "RESPONDED"] } },
			data: { lastMessageAt: now, renterLastReadAt: now },
		});
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("refuses, and creates no message, when the thread closed between the check and the write", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("NEW"));
		mockInquiryUpdateMany.mockResolvedValueOnce({ count: 0 });
		await expect(postMessage("inq_1", HOST, "Yes", now)).resolves.toEqual({ kind: "closed" });
		expect(mockMessageCreate).not.toHaveBeenCalled();
		expect(mockInquiryUpdateMany).toHaveBeenCalledTimes(1);
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("a host posting on RESPONDED never writes a status unconditionally", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("RESPONDED"));
		mockMessageCreate.mockResolvedValue({ id: "m9", body: "Yes", senderId: HOST, createdAt: now });
		await postMessage("inq_1", HOST, "Yes", now);
		const statusWrites = mockInquiryUpdateMany.mock.calls.filter(([args]) => "status" in args.data);
		expect(statusWrites).toEqual([[{ where: { id: "inq_1", status: "NEW" }, data: { status: "RESPONDED" } }]]);
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("a renter posting on RESPONDED keeps it RESPONDED (no status write)", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("RESPONDED"));
		await expect(postMessage("inq_1", RENTER, "Hi", now)).resolves.toMatchObject({ kind: "sent" });
		const statusWrites = mockInquiryUpdateMany.mock.calls.filter(([args]) => "status" in args.data);
		expect(statusWrites).toEqual([]);
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});
});

describe("changeStatus", () => {
	it("lets the host decline, guarded on the thread still being open", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("RESPONDED"));
		await expect(changeStatus("inq_1", HOST, "decline")).resolves.toEqual({ kind: "ok", status: "DECLINED" });
		expect(mockInquiryUpdateMany).toHaveBeenCalledWith({
			where: { id: "inq_1", status: { in: ["NEW", "RESPONDED"] } },
			data: { status: "DECLINED" },
		});
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("refuses decline from the renter", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow());
		await expect(changeStatus("inq_1", RENTER, "decline")).resolves.toEqual({ kind: "not-host" });
		expect(mockInquiryUpdateMany).not.toHaveBeenCalled();
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("lets either side close", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow());
		await expect(changeStatus("inq_1", RENTER, "close")).resolves.toEqual({ kind: "ok", status: "CLOSED" });
	});

	it("returns closed when another request closed the thread first (no last-write-wins)", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("NEW"));
		mockInquiryUpdateMany.mockResolvedValueOnce({ count: 0 });
		await expect(changeStatus("inq_1", RENTER, "close")).resolves.toEqual({ kind: "closed" });
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("refuses a thread that's already closed, and hides threads from strangers", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("CLOSED"));
		await expect(changeStatus("inq_1", HOST, "close")).resolves.toEqual({ kind: "closed" });
		mockInquiryFindUnique.mockResolvedValue(participationRow());
		await expect(changeStatus("inq_1", "user_stranger", "close")).resolves.toEqual({ kind: "not-found" });
		expect(mockInquiryUpdateMany).not.toHaveBeenCalled();
	});
});
