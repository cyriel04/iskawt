/** @jest-environment node */
const mockSpaceFindFirst = jest.fn();
const mockInquiryFindUnique = jest.fn();
const mockInquiryFindFirst = jest.fn();
const mockInquiryCount = jest.fn();
const mockInquiryCreate = jest.fn();
const mockInquiryUpdate = jest.fn();
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

	it("host's first reply moves NEW to RESPONDED and marks the host read", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("NEW"));
		mockMessageCreate.mockResolvedValue({ id: "m9", body: "Yes", senderId: HOST, createdAt: now });
		await expect(postMessage("inq_1", HOST, "Yes", now)).resolves.toEqual({
			kind: "sent",
			message: { id: "m9", body: "Yes", sentAt: now.toISOString(), fromMe: true, senderName: "Demo Host A" },
		});
		expect(mockInquiryUpdate).toHaveBeenCalledWith({
			where: { id: "inq_1" },
			data: { lastMessageAt: now, hostLastReadAt: now, status: "RESPONDED" },
			select: { id: true },
		});
	});

	it("renter's message keeps the status and marks the renter read", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("NEW"));
		await postMessage("inq_1", RENTER, "Hi", now);
		expect(mockInquiryUpdate).toHaveBeenCalledWith({
			where: { id: "inq_1" },
			data: { lastMessageAt: now, renterLastReadAt: now },
			select: { id: true },
		});
	});
});

describe("changeStatus", () => {
	it("lets the host decline", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("RESPONDED"));
		mockInquiryUpdate.mockResolvedValue({ status: "DECLINED" });
		await expect(changeStatus("inq_1", HOST, "decline")).resolves.toEqual({ kind: "ok", status: "DECLINED" });
		expect(mockInquiryUpdate).toHaveBeenCalledWith({
			where: { id: "inq_1" },
			data: { status: "DECLINED" },
			select: { status: true },
		});
	});

	it("refuses decline from the renter", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow());
		await expect(changeStatus("inq_1", RENTER, "decline")).resolves.toEqual({ kind: "not-host" });
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("lets either side close", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow());
		mockInquiryUpdate.mockResolvedValue({ status: "CLOSED" });
		await expect(changeStatus("inq_1", RENTER, "close")).resolves.toEqual({ kind: "ok", status: "CLOSED" });
	});

	it("refuses a thread that's already closed, and hides threads from strangers", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("CLOSED"));
		await expect(changeStatus("inq_1", HOST, "close")).resolves.toEqual({ kind: "closed" });
		mockInquiryFindUnique.mockResolvedValue(participationRow());
		await expect(changeStatus("inq_1", "user_stranger", "close")).resolves.toEqual({ kind: "not-found" });
	});
});
