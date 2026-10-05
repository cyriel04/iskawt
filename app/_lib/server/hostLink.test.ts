/** @jest-environment node */
const mockHostFindFirst = jest.fn();
const mockQueryRaw = jest.fn();
const mockHostUpdateMany = jest.fn();

jest.mock("@/app/_lib/db", () => ({
	prisma: {
		$queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
		host: {
			findFirst: (...a: unknown[]) => mockHostFindFirst(...a),
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
	mockQueryRaw.mockResolvedValue([{ id: "host_a" }]);
	await expect(linkHostForUser(user)).resolves.toBe("linked");
	expect(mockHostUpdateMany).toHaveBeenCalledWith({
		where: { id: "host_a", userId: null },
		data: { userId: "user_demo" },
	});
});

it("reports no match when a concurrent sign-in linked the host first", async () => {
	mockQueryRaw.mockResolvedValue([{ id: "host_a" }]);
	mockHostUpdateMany.mockResolvedValue({ count: 0 });
	await expect(linkHostForUser(user)).resolves.toBe("no-match");
});

it("does nothing when no verified, unlinked host matches (unverified or other email)", async () => {
	mockQueryRaw.mockResolvedValue([]);
	await expect(linkHostForUser(user)).resolves.toBe("no-match");
	expect(mockHostUpdateMany).not.toHaveBeenCalled();
});

it("does nothing when two hosts match case-insensitively", async () => {
	mockQueryRaw.mockResolvedValue([{ id: "host_a" }, { id: "host_b" }]);
	await expect(linkHostForUser(user)).resolves.toBe("ambiguous");
	expect(mockHostUpdateMany).not.toHaveBeenCalled();
});

it("does nothing when the user is already linked to a host", async () => {
	mockHostFindFirst.mockResolvedValue({ id: "host_a" });
	await expect(linkHostForUser(user)).resolves.toBe("already-linked");
	expect(mockQueryRaw).not.toHaveBeenCalled();
});

// C1: Prisma's `mode: "insensitive"` compiles to an unescaped ILIKE, where `_`
// and `%` are wildcards, so maria_santos@... would match maria.santos@...
// The lookup must be an exact comparison on a bound value.
function lookupCall(): { sql: string; values: unknown[] } {
	expect(mockQueryRaw).toHaveBeenCalledTimes(1);
	const [strings, ...values] = mockQueryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
	return { sql: strings.join("?"), values };
}

it("matches by exact equality on the trimmed, lowercased email, never LIKE/ILIKE", async () => {
	mockQueryRaw.mockResolvedValue([{ id: "host_a" }]);
	await linkHostForUser(user);
	const { sql } = lookupCall();
	expect(sql).toContain('lower(btrim("contactEmail")) =');
	expect(sql).not.toMatch(/\bI?LIKE\b/i);
	expect(sql).toContain('"verifiedAt" IS NOT NULL');
	expect(sql).toContain('"userId" IS NULL');
	expect(sql).toContain("LIMIT 2");
	expect(sql).toMatch(/SELECT\s+"id"\s+FROM\s+"Host"/);
});

it("passes the normalized email as a bound value, never inlined into the SQL", async () => {
	mockQueryRaw.mockResolvedValue([{ id: "host_a" }]);
	await linkHostForUser({ id: "user_demo", email: " Maria_Santos@Example.invalid " });
	const { sql, values } = lookupCall();
	expect(values).toEqual(["maria_santos@example.invalid"]);
	expect(sql.toLowerCase()).not.toContain("maria_santos");
});

it("never selects contact fields", async () => {
	mockQueryRaw.mockResolvedValue([{ id: "host_a" }]);
	await linkHostForUser(user);
	const calls = [...mockHostFindFirst.mock.calls, ...mockHostUpdateMany.mock.calls];
	for (const [args] of calls) {
		expect(JSON.stringify((args as { select?: unknown }).select ?? null)).not.toMatch(/contact/);
	}
});
