/** @jest-environment node */
const mockGetCurrentUser = jest.fn();
const mockBlock = jest.fn();
const mockUnblock = jest.fn();

jest.mock("@/app/_lib/server/currentUser", () => ({ getCurrentUser: () => mockGetCurrentUser() }));
jest.mock("@/app/_lib/server/blocks", () => ({
	blockCounterpart: (...a: unknown[]) => mockBlock(...a),
	unblockCounterpart: (...a: unknown[]) => mockUnblock(...a),
}));

import { DELETE as unblockRoute, POST as blockRoute } from "@/app/api/inquiries/[id]/block/route";

const user = { id: "user_renter", email: "demo@example.invalid", name: null, host: null };
const ctx = { params: Promise.resolve({ id: "inq_1" }) };
const req = (method: string) => new Request("http://localhost/api/inquiries/inq_1/block", { method });

beforeEach(() => {
	jest.resetAllMocks();
	mockGetCurrentUser.mockResolvedValue(user);
});

describe("/api/inquiries/[id]/block", () => {
	it.each([
		["POST", blockRoute],
		["DELETE", unblockRoute],
	] as const)("%s 401 when signed out", async (method, route) => {
		mockGetCurrentUser.mockResolvedValue(null);
		const res = await route(req(method), ctx);
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "UNAUTHENTICATED" });
	});

	it("POST 200 { blockedByMe: true }", async () => {
		mockBlock.mockResolvedValue({ kind: "ok", blockedByMe: true });
		const res = await blockRoute(req("POST"), ctx);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ blockedByMe: true });
		expect(mockBlock).toHaveBeenCalledWith("inq_1", "user_renter");
	});

	it("DELETE 200 { blockedByMe: false }", async () => {
		mockUnblock.mockResolvedValue({ kind: "ok", blockedByMe: false });
		const res = await unblockRoute(req("DELETE"), ctx);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ blockedByMe: false });
	});

	it("404 for someone outside the thread", async () => {
		mockBlock.mockResolvedValue({ kind: "not-found" });
		const res = await blockRoute(req("POST"), ctx);
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "NOT_FOUND" });
	});

	it("409 NOT_LINKED when the host hasn't signed in yet", async () => {
		mockBlock.mockResolvedValue({ kind: "not-linked" });
		const res = await blockRoute(req("POST"), ctx);
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: "NOT_LINKED" });
	});
});
