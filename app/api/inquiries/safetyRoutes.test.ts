/** @jest-environment node */
const mockGetCurrentUser = jest.fn();
const mockBlock = jest.fn();
const mockUnblock = jest.fn();
const mockCreateReport = jest.fn();
const mockNotifyReport = jest.fn();
const afterCallbacks: Array<() => unknown> = [];

jest.mock("@/app/_lib/server/currentUser", () => ({ getCurrentUser: () => mockGetCurrentUser() }));
jest.mock("@/app/_lib/server/blocks", () => ({
	blockCounterpart: (...a: unknown[]) => mockBlock(...a),
	unblockCounterpart: (...a: unknown[]) => mockUnblock(...a),
}));

jest.mock("@/app/_lib/server/reports", () => ({ createReport: (...a: unknown[]) => mockCreateReport(...a) }));
jest.mock("@/app/_lib/server/reportNotify", () => ({ notifyReport: (...a: unknown[]) => mockNotifyReport(...a) }));
jest.mock("next/server", () => ({ after: (cb: () => unknown) => afterCallbacks.push(cb) }));

import { POST as reportRoute } from "@/app/api/inquiries/[id]/report/route";
import { DELETE as unblockRoute, POST as blockRoute } from "@/app/api/inquiries/[id]/block/route";

const user = { id: "user_renter", email: "demo@example.invalid", name: null, host: null };
const ctx = { params: Promise.resolve({ id: "inq_1" }) };
const req = (method: string) => new Request("http://localhost/api/inquiries/inq_1/block", { method });

beforeEach(() => {
	jest.resetAllMocks();
	afterCallbacks.length = 0;
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

const reportReq = (body: unknown) =>
	new Request("http://localhost/api/inquiries/inq_1/report", {
		method: "POST",
		body: typeof body === "string" ? body : JSON.stringify(body),
		headers: { "content-type": "application/json" },
	});

describe("POST /api/inquiries/[id]/report", () => {
	it("401 when signed out", async () => {
		mockGetCurrentUser.mockResolvedValue(null);
		const res = await reportRoute(reportReq({ reason: "SPAM" }), ctx);
		expect(res.status).toBe(401);
		expect(mockCreateReport).not.toHaveBeenCalled();
	});

	it("201 { id }, then notifies ops from after()", async () => {
		mockCreateReport.mockResolvedValue({ kind: "created", id: "rep_1" });
		const res = await reportRoute(reportReq({ reason: "SPAM", detail: " spam links " }), ctx);
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({ id: "rep_1" });
		expect(mockCreateReport).toHaveBeenCalledWith("inq_1", "user_renter", { reason: "SPAM", detail: "spam links" });
		expect(afterCallbacks).toHaveLength(1);
		await afterCallbacks[0]();
		expect(mockNotifyReport).toHaveBeenCalledWith("rep_1");
	});

	it.each([
		[{ reason: "NOPE" }, { reason: "Choose a reason." }],
		[{ reason: "SPAM", detail: "x".repeat(1001) }, { detail: "Keep it under 1000 characters." }],
	])("400 VALIDATION with field errors (%o)", async (body, fields) => {
		const res = await reportRoute(reportReq(body), ctx);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "VALIDATION", fields });
		expect(mockCreateReport).not.toHaveBeenCalled();
	});

	it("400 VALIDATION for malformed JSON", async () => {
		const res = await reportRoute(reportReq("{not json"), ctx);
		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ error: "VALIDATION" });
	});

	it("404 for someone outside the thread, 429 past the daily limit, neither notifies", async () => {
		mockCreateReport.mockResolvedValueOnce({ kind: "not-found" }).mockResolvedValueOnce({ kind: "rate-limited" });
		expect((await reportRoute(reportReq({ reason: "SPAM" }), ctx)).status).toBe(404);
		const limited = await reportRoute(reportReq({ reason: "SPAM" }), ctx);
		expect(limited.status).toBe(429);
		expect(await limited.json()).toEqual({ error: "RATE_LIMITED" });
		expect(afterCallbacks).toHaveLength(0);
	});
});
