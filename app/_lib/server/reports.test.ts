/** @jest-environment node */
const mockGetParticipation = jest.fn();
const mockCount = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/app/_lib/server/inquiryAccess", () => ({ getParticipation: (...a: unknown[]) => mockGetParticipation(...a) }));
jest.mock("@/app/_lib/db", () => ({
	prisma: { report: { count: (...a: unknown[]) => mockCount(...a), create: (...a: unknown[]) => mockCreate(...a) } },
}));

import { createReport } from "@/app/_lib/server/reports";

const now = new Date("2026-10-19T10:00:00Z");
const dayAgo = new Date("2026-10-18T10:00:00Z");
const input = { reason: "SCAM_OR_PHISHING" as const, detail: "Asked for a deposit by bank transfer" };

beforeEach(() => {
	jest.resetAllMocks();
	mockGetParticipation.mockResolvedValue({ id: "inq_1", role: "HOST", canSend: false });
	mockCount.mockResolvedValue(0);
	mockCreate.mockResolvedValue({ id: "rep_1" });
});

it("creates a report on any thread the user is in, even a read-only one", async () => {
	await expect(createReport("inq_1", "user_host", input, now)).resolves.toEqual({ kind: "created", id: "rep_1" });
	expect(mockCreate).toHaveBeenCalledWith({
		data: { reporterId: "user_host", inquiryId: "inq_1", reason: "SCAM_OR_PHISHING", detail: "Asked for a deposit by bank transfer" },
		select: { id: true },
	});
});

it("not-found for someone outside the thread", async () => {
	mockGetParticipation.mockResolvedValue(null);
	await expect(createReport("inq_1", "user_other", input, now)).resolves.toEqual({ kind: "not-found" });
	expect(mockCreate).not.toHaveBeenCalled();
});

it("rate-limited at 10 reports in the last 24 hours", async () => {
	mockCount.mockResolvedValue(10);
	await expect(createReport("inq_1", "user_host", input, now)).resolves.toEqual({ kind: "rate-limited" });
	expect(mockCount).toHaveBeenCalledWith({ where: { reporterId: "user_host", createdAt: { gt: dayAgo } } });
	expect(mockCreate).not.toHaveBeenCalled();
});

it("allows the 10th report (9 before it)", async () => {
	mockCount.mockResolvedValue(9);
	await expect(createReport("inq_1", "user_host", input, now)).resolves.toMatchObject({ kind: "created" });
});
