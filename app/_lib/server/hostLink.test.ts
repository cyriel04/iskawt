/** @jest-environment node */
const mockHostFindFirst = jest.fn();
const mockHostFindMany = jest.fn();
const mockHostUpdateMany = jest.fn();

jest.mock("@/app/_lib/db", () => ({
	prisma: {
		host: {
			findFirst: (...a: unknown[]) => mockHostFindFirst(...a),
			findMany: (...a: unknown[]) => mockHostFindMany(...a),
			updateMany: (...a: unknown[]) => mockHostUpdateMany(...a),
		},
	},
}));

import { linkHostForUser } from "@/app/_lib/server/hostLink";

const user = { id: "user_demo", email: "  Demo-Host-A@Example.invalid " };

beforeEach(() => {
	jest.resetAllMocks();
	mockHostFindFirst.mockResolvedValue(null); // user not yet linked to anything
	mockHostUpdateMany.mockResolvedValue({ count: 1 });
});

it("links the single verified, unlinked host whose email matches, ignoring case and spaces", async () => {
	mockHostFindMany.mockResolvedValue([{ id: "host_a" }]);
	await expect(linkHostForUser(user)).resolves.toBe("linked");
	expect(mockHostFindMany).toHaveBeenCalledWith({
		where: {
			contactEmail: { equals: "demo-host-a@example.invalid", mode: "insensitive" },
			verifiedAt: { not: null },
			userId: null,
		},
		select: { id: true },
		take: 2,
	});
	expect(mockHostUpdateMany).toHaveBeenCalledWith({
		where: { id: "host_a", userId: null },
		data: { userId: "user_demo" },
	});
});

it("reports no match when a concurrent sign-in linked the host first", async () => {
	mockHostFindMany.mockResolvedValue([{ id: "host_a" }]);
	mockHostUpdateMany.mockResolvedValue({ count: 0 });
	await expect(linkHostForUser(user)).resolves.toBe("no-match");
});

it("does nothing when no verified, unlinked host matches (unverified or other email)", async () => {
	mockHostFindMany.mockResolvedValue([]);
	await expect(linkHostForUser(user)).resolves.toBe("no-match");
	expect(mockHostUpdateMany).not.toHaveBeenCalled();
});

it("does nothing when two hosts match case-insensitively", async () => {
	mockHostFindMany.mockResolvedValue([{ id: "host_a" }, { id: "host_b" }]);
	await expect(linkHostForUser(user)).resolves.toBe("ambiguous");
	expect(mockHostUpdateMany).not.toHaveBeenCalled();
});

it("does nothing when the user is already linked to a host", async () => {
	mockHostFindFirst.mockResolvedValue({ id: "host_a" });
	await expect(linkHostForUser(user)).resolves.toBe("already-linked");
	expect(mockHostFindMany).not.toHaveBeenCalled();
});

it("never selects contact fields", async () => {
	mockHostFindMany.mockResolvedValue([{ id: "host_a" }]);
	await linkHostForUser(user);
	const calls = [...mockHostFindFirst.mock.calls, ...mockHostFindMany.mock.calls, ...mockHostUpdateMany.mock.calls];
	for (const [args] of calls) {
		expect(JSON.stringify((args as { select?: unknown }).select ?? null)).not.toMatch(/contact/);
	}
});
