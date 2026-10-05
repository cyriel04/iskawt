/** @jest-environment node */
const mockGetSession = jest.fn();
const mockUserFindUnique = jest.fn();

jest.mock("next/headers", () => ({ headers: async () => new Headers() }));
jest.mock("@/app/_lib/server/auth", () => ({
	auth: { api: { getSession: (...a: unknown[]) => mockGetSession(...a) } },
}));
jest.mock("@/app/_lib/db", () => ({
	prisma: { user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) } },
}));

import { getCurrentUser } from "@/app/_lib/server/currentUser";

beforeEach(() => jest.resetAllMocks());

it("returns null without a session", async () => {
	mockGetSession.mockResolvedValue(null);
	await expect(getCurrentUser()).resolves.toBeNull();
	expect(mockUserFindUnique).not.toHaveBeenCalled();
});

it("returns the session holder, with '' name mapped to null and no host", async () => {
	mockGetSession.mockResolvedValue({ user: { id: "user_demo" } });
	mockUserFindUnique.mockResolvedValue({ id: "user_demo", email: "demo-user@example.invalid", name: "", host: null });
	await expect(getCurrentUser()).resolves.toEqual({
		id: "user_demo",
		email: "demo-user@example.invalid",
		name: null,
		host: null,
	});
	expect(mockUserFindUnique).toHaveBeenCalledWith({
		where: { id: "user_demo" },
		select: { id: true, email: true, name: true, host: { select: { displayName: true, verifiedAt: true } } },
	});
});

it("includes the linked host's display name only while it is verified", async () => {
	mockGetSession.mockResolvedValue({ user: { id: "u" } });
	mockUserFindUnique.mockResolvedValue({
		id: "u",
		email: "a@example.invalid",
		name: "Demo",
		host: { displayName: "Demo Host A", verifiedAt: new Date() },
	});
	await expect(getCurrentUser()).resolves.toMatchObject({ host: { displayName: "Demo Host A" } });

	mockUserFindUnique.mockResolvedValue({
		id: "u",
		email: "a@example.invalid",
		name: "Demo",
		host: { displayName: "Demo Host A", verifiedAt: null },
	});
	await expect(getCurrentUser()).resolves.toMatchObject({ host: null });
});

it("never carries host contact fields, even if the row has them", async () => {
	mockGetSession.mockResolvedValue({ user: { id: "u" } });
	mockUserFindUnique.mockResolvedValue({
		id: "u",
		email: "a@example.invalid",
		name: "Demo",
		host: { displayName: "Demo Host A", verifiedAt: new Date(), contactEmail: "x@example.invalid", contactPhone: "0000" },
	});
	const json = JSON.stringify(await getCurrentUser());
	expect(json).not.toMatch(/contactEmail|contactPhone|verifiedAt|x@example/);
});

it("returns null when the session's user row no longer exists", async () => {
	mockGetSession.mockResolvedValue({ user: { id: "gone" } });
	mockUserFindUnique.mockResolvedValue(null);
	await expect(getCurrentUser()).resolves.toBeNull();
});
