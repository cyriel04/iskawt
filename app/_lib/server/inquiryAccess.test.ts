/** @jest-environment node */
const mockSpaceCount = jest.fn();
const mockInquiryFindUnique = jest.fn();
const mockBlockFindMany = jest.fn();
jest.mock("@/app/_lib/db", () => ({
	prisma: {
		space: { count: (...a: unknown[]) => mockSpaceCount(...a) },
		inquiry: { findUnique: (...a: unknown[]) => mockInquiryFindUnique(...a) },
		block: { findMany: (...a: unknown[]) => mockBlockFindMany(...a) },
	},
}));

import { blockersBetween, canSendIn, getParticipation, isHostOfSpace } from "@/app/_lib/server/inquiryAccess";

beforeEach(() => jest.resetAllMocks());

it("is true when the space's host is linked to this user", async () => {
	mockSpaceCount.mockResolvedValue(1);
	await expect(isHostOfSpace("demo-poblacion-loft", "user_host")).resolves.toBe(true);
	expect(mockSpaceCount).toHaveBeenCalledWith({ where: { slug: "demo-poblacion-loft", host: { userId: "user_host" } } });
});

it("is false otherwise", async () => {
	mockSpaceCount.mockResolvedValue(0);
	await expect(isHostOfSpace("demo-poblacion-loft", "user_renter")).resolves.toBe(false);
});

const RENTER = "user_renter";
const HOST = "user_host";
const row = (status: string, verifiedAt: Date | null = new Date("2026-10-01T00:00:00Z"), hostUserId: string | null = HOST) => ({
	id: "inq_1",
	status,
	renterId: RENTER,
	requesterName: "Demo Renter",
	space: { host: { userId: hostUserId, displayName: "Demo Host A", verifiedAt } },
});

describe("canSendIn", () => {
	it.each([
		["NEW", true, [], true],
		["RESPONDED", true, [], true],
		["DECLINED", true, [], false],
		["CLOSED", true, [], false],
		["NEW", false, [], false],
		["NEW", true, [RENTER], false],
		["NEW", true, [HOST], false],
		["NEW", true, [RENTER, HOST], false],
		["CLOSED", false, [HOST], false],
	] as const)("status %s, verified %s, blockers %j → %s", (status, verified, blockers, expected) => {
		expect(canSendIn(status, verified, blockers)).toBe(expected);
	});
});

describe("blockersBetween", () => {
	it("asks for blocks in both directions and returns the blocker ids", async () => {
		mockBlockFindMany.mockResolvedValue([{ blockerId: HOST }]);
		await expect(blockersBetween(RENTER, HOST)).resolves.toEqual([HOST]);
		expect(mockBlockFindMany).toHaveBeenCalledWith({
			where: { OR: [{ blockerId: RENTER, blockedId: HOST }, { blockerId: HOST, blockedId: RENTER }] },
			select: { blockerId: true },
		});
	});
	it("is empty without querying when the host isn't linked", async () => {
		await expect(blockersBetween(RENTER, null)).resolves.toEqual([]);
		expect(mockBlockFindMany).not.toHaveBeenCalled();
	});
});

describe("getParticipation", () => {
	it.each([
		// viewer, blockers, verified, canSend, blockedByMe
		[RENTER, [], true, true, false],
		[RENTER, [RENTER], true, false, true],
		[RENTER, [HOST], true, false, false],
		[RENTER, [RENTER, HOST], true, false, true],
		[HOST, [HOST], true, false, true],
		[HOST, [RENTER], true, false, false],
		[RENTER, [], false, false, false],
		[HOST, [], false, false, false],
	] as const)("viewer %s, blockers %j, verified %s → canSend %s, blockedByMe %s", async (viewer, blockers, verified, canSend, blockedByMe) => {
		mockInquiryFindUnique.mockResolvedValue(row("NEW", verified ? new Date("2026-10-01T00:00:00Z") : null));
		mockBlockFindMany.mockResolvedValue(blockers.map((blockerId) => ({ blockerId })));
		const p = await getParticipation("inq_1", viewer);
		expect(p).toMatchObject({ role: viewer === RENTER ? "RENTER" : "HOST", canSend, blockedByMe });
	});

	it("still lets an unverified host and a blocked renter read (participation is not null)", async () => {
		mockInquiryFindUnique.mockResolvedValue(row("NEW", null));
		mockBlockFindMany.mockResolvedValue([{ blockerId: HOST }]);
		await expect(getParticipation("inq_1", HOST)).resolves.not.toBeNull();
		await expect(getParticipation("inq_1", RENTER)).resolves.not.toBeNull();
	});

	it("is null for someone outside the thread, and doesn't look up blocks", async () => {
		mockInquiryFindUnique.mockResolvedValue(row("NEW"));
		await expect(getParticipation("inq_1", "user_other")).resolves.toBeNull();
		expect(mockBlockFindMany).not.toHaveBeenCalled();
	});

	it("selects the host's verifiedAt and nothing private", async () => {
		mockInquiryFindUnique.mockResolvedValue(row("NEW"));
		mockBlockFindMany.mockResolvedValue([]);
		await getParticipation("inq_1", RENTER);
		expect(mockInquiryFindUnique).toHaveBeenCalledWith({
			where: { id: "inq_1" },
			select: {
				id: true,
				status: true,
				renterId: true,
				requesterName: true,
				space: { select: { host: { select: { userId: true, displayName: true, verifiedAt: true } } } },
			},
		});
	});
});
