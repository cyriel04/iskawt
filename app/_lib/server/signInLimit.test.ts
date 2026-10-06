/** @jest-environment node */
const mockCount = jest.fn();
const mockCreate = jest.fn();
const mockDeleteMany = jest.fn();

jest.mock("@/app/_lib/db", () => ({
	prisma: {
		signInRequest: {
			count: (...a: unknown[]) => mockCount(...a),
			create: (...a: unknown[]) => mockCreate(...a),
			deleteMany: (...a: unknown[]) => mockDeleteMany(...a),
		},
	},
}));

import { normalizeEmail, recordSignInRequest } from "@/app/_lib/server/signInLimit";
import { MAGIC_LINK_REQUESTS_PER_HOUR } from "@/app/_lib/constants/limits";

const now = new Date("2026-10-05T10:00:00Z");

beforeEach(() => {
	jest.resetAllMocks();
	mockDeleteMany.mockResolvedValue({ count: 0 });
});

it("normalizes email by trimming and lowercasing", () => {
	expect(normalizeEmail("  Demo@Example.INVALID ")).toBe("demo@example.invalid");
});

it("allows and records a request under the limit", async () => {
	mockCount.mockResolvedValue(MAGIC_LINK_REQUESTS_PER_HOUR - 1);
	await expect(recordSignInRequest(" Demo@Example.invalid", now)).resolves.toBe(true);
	expect(mockCount).toHaveBeenCalledWith({
		where: { email: "demo@example.invalid", createdAt: { gt: new Date("2026-10-05T09:00:00Z") } },
	});
	expect(mockCreate).toHaveBeenCalledWith({ data: { email: "demo@example.invalid" }, select: { id: true } });
});

it("refuses the request once the hourly limit is reached, and records nothing", async () => {
	mockCount.mockResolvedValue(MAGIC_LINK_REQUESTS_PER_HOUR);
	await expect(recordSignInRequest("demo@example.invalid", now)).resolves.toBe(false);
	expect(mockCreate).not.toHaveBeenCalled();
});

// I4: rows past the window do nothing for the limit and hold an email address,
// so each request prunes them, for every address, not just this one.
it.each([
	["allowed", MAGIC_LINK_REQUESTS_PER_HOUR - 1],
	["refused", MAGIC_LINK_REQUESTS_PER_HOUR],
])("deletes every request older than the window, for all emails, when %s", async (_label, recent) => {
	mockCount.mockResolvedValue(recent);
	await recordSignInRequest("demo@example.invalid", now);
	expect(mockDeleteMany).toHaveBeenCalledTimes(1);
	expect(mockDeleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date("2026-10-05T09:00:00Z") } } });
});
