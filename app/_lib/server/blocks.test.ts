/** @jest-environment node */
const mockGetParticipation = jest.fn();
const mockUpsert = jest.fn();
const mockDeleteMany = jest.fn();

jest.mock("@/app/_lib/server/inquiryAccess", () => ({ getParticipation: (...a: unknown[]) => mockGetParticipation(...a) }));
jest.mock("@/app/_lib/db", () => ({
	prisma: { block: { upsert: (...a: unknown[]) => mockUpsert(...a), deleteMany: (...a: unknown[]) => mockDeleteMany(...a) } },
}));

import { blockCounterpart, unblockCounterpart } from "@/app/_lib/server/blocks";

const RENTER = "user_renter";
const HOST = "user_host";
const participation = (role: "RENTER" | "HOST", hostUserId: string | null = HOST) => ({
	id: "inq_1",
	status: "RESPONDED",
	role,
	renterId: RENTER,
	requesterName: "Demo Renter",
	hostDisplayName: "Demo Host A",
	hostUserId,
	canSend: true,
	blockedByMe: false,
});

beforeEach(() => jest.resetAllMocks());

describe("blockCounterpart", () => {
	it("a renter blocks the host's user, idempotently (upsert on the pair)", async () => {
		mockGetParticipation.mockResolvedValue(participation("RENTER"));
		await expect(blockCounterpart("inq_1", RENTER)).resolves.toEqual({ kind: "ok", blockedByMe: true });
		expect(mockUpsert).toHaveBeenCalledWith({
			where: { blockerId_blockedId: { blockerId: RENTER, blockedId: HOST } },
			create: { blockerId: RENTER, blockedId: HOST },
			update: {},
			select: { id: true },
		});
	});

	it("a host blocks the renter", async () => {
		mockGetParticipation.mockResolvedValue(participation("HOST"));
		await blockCounterpart("inq_1", HOST);
		expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: { blockerId: HOST, blockedId: RENTER } }));
	});

	it("not-found for someone outside the thread", async () => {
		mockGetParticipation.mockResolvedValue(null);
		await expect(blockCounterpart("inq_1", "user_other")).resolves.toEqual({ kind: "not-found" });
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	it("not-linked when the host has no user yet; writes nothing", async () => {
		mockGetParticipation.mockResolvedValue(participation("RENTER", null));
		await expect(blockCounterpart("inq_1", RENTER)).resolves.toEqual({ kind: "not-linked" });
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	it("works on a closed thread", async () => {
		mockGetParticipation.mockResolvedValue({ ...participation("RENTER"), status: "CLOSED", canSend: false });
		await expect(blockCounterpart("inq_1", RENTER)).resolves.toEqual({ kind: "ok", blockedByMe: true });
	});
});

describe("unblockCounterpart", () => {
	it("removes only the viewer's own block", async () => {
		mockGetParticipation.mockResolvedValue(participation("RENTER"));
		mockDeleteMany.mockResolvedValue({ count: 1 });
		await expect(unblockCounterpart("inq_1", RENTER)).resolves.toEqual({ kind: "ok", blockedByMe: false });
		expect(mockDeleteMany).toHaveBeenCalledWith({ where: { blockerId: RENTER, blockedId: HOST } });
	});

	it("is idempotent when there was no block", async () => {
		mockGetParticipation.mockResolvedValue(participation("HOST"));
		mockDeleteMany.mockResolvedValue({ count: 0 });
		await expect(unblockCounterpart("inq_1", HOST)).resolves.toEqual({ kind: "ok", blockedByMe: false });
		expect(mockDeleteMany).toHaveBeenCalledWith({ where: { blockerId: HOST, blockedId: RENTER } });
	});

	it("is ok with nothing to delete when the host has no user", async () => {
		mockGetParticipation.mockResolvedValue(participation("RENTER", null));
		await expect(unblockCounterpart("inq_1", RENTER)).resolves.toEqual({ kind: "ok", blockedByMe: false });
		expect(mockDeleteMany).not.toHaveBeenCalled();
	});

	it("not-found for someone outside the thread", async () => {
		mockGetParticipation.mockResolvedValue(null);
		await expect(unblockCounterpart("inq_1", "user_other")).resolves.toEqual({ kind: "not-found" });
	});
});
