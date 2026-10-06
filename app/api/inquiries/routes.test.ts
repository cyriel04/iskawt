/** @jest-environment node */
const mockGetCurrentUser = jest.fn();
const mockCreateInquiry = jest.fn();
const mockPostMessage = jest.fn();
const mockChangeStatus = jest.fn();
const mockGetMessagesAfter = jest.fn();

const mockNotify = jest.fn();
const afterCallbacks: Array<() => unknown> = [];
jest.mock("@/app/_lib/server/inquiryNotify", () => ({ notifyCounterpart: (...a: unknown[]) => mockNotify(...a) }));
jest.mock("next/server", () => ({ after: (cb: () => unknown) => afterCallbacks.push(cb) }));

jest.mock("@/app/_lib/server/currentUser", () => ({ getCurrentUser: () => mockGetCurrentUser() }));
jest.mock("@/app/_lib/server/inquiryWrites", () => ({
	createInquiry: (...a: unknown[]) => mockCreateInquiry(...a),
	postMessage: (...a: unknown[]) => mockPostMessage(...a),
	changeStatus: (...a: unknown[]) => mockChangeStatus(...a),
}));
jest.mock("@/app/_lib/server/inquiries", () => ({
	getMessagesAfter: (...a: unknown[]) => mockGetMessagesAfter(...a),
}));

import { POST as createRoute } from "@/app/api/inquiries/route";
import { GET as listMessages, POST as sendMessage } from "@/app/api/inquiries/[id]/messages/route";
import { POST as statusRoute } from "@/app/api/inquiries/[id]/status/route";

const user = { id: "user_renter", email: "demo@example.invalid", name: null, host: null };
const ctx = { params: Promise.resolve({ id: "inq_1" }) };
const json = (body: unknown) =>
	new Request("http://localhost/api/inquiries", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const validBody = {
	spaceSlug: "demo-poblacion-loft",
	requesterName: "Demo Renter",
	productionType: "FILM",
	message: "Free next week?",
	website: "",
};

beforeEach(() => {
	jest.resetAllMocks();
	afterCallbacks.length = 0;
	mockGetCurrentUser.mockResolvedValue(user);
});

describe("POST /api/inquiries", () => {
	it("401 when signed out", async () => {
		mockGetCurrentUser.mockResolvedValue(null);
		const res = await createRoute(json(validBody));
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "UNAUTHENTICATED" });
	});

	it("400 VALIDATION with field errors, and 400 for malformed JSON", async () => {
		const bad = await createRoute(json({ ...validBody, requesterName: "" }));
		expect(bad.status).toBe(400);
		expect(await bad.json()).toEqual({ error: "VALIDATION", fields: { requesterName: "Enter your name." } });

		const malformed = await createRoute(
			new Request("http://localhost/api/inquiries", { method: "POST", body: "{not json" }),
		);
		expect(malformed.status).toBe(400);
		expect(mockCreateInquiry).not.toHaveBeenCalled();
	});

	it("fakes success for a filled spam trap, even with other invalid fields, and creates nothing", async () => {
		const res = await createRoute(json({ website: "http://spam.example" }));
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({ id: null, reused: false });
		expect(mockCreateInquiry).not.toHaveBeenCalled();
	});

	it.each([
		[{ kind: "created", id: "inq_new" }, 201, { id: "inq_new", reused: false }],
		[{ kind: "reused", id: "inq_open" }, 200, { id: "inq_open", reused: true }],
		[{ kind: "not-found" }, 404, { error: "NOT_FOUND" }],
		[{ kind: "own-space" }, 400, { error: "OWN_SPACE" }],
		[{ kind: "rate-limited" }, 429, { error: "RATE_LIMITED" }],
	])("maps %o to %i", async (outcome, status, body) => {
		mockCreateInquiry.mockResolvedValue(outcome);
		const res = await createRoute(json(validBody));
		expect(res.status).toBe(status);
		expect(await res.json()).toEqual(body);
	});

	it("passes the signed-in user's id, never a client-supplied one", async () => {
		mockCreateInquiry.mockResolvedValue({ kind: "created", id: "inq_new" });
		await createRoute(json({ ...validBody, renterId: "user_someone_else" }));
		expect(mockCreateInquiry.mock.calls[0][0]).toBe("user_renter");
		expect(mockCreateInquiry.mock.calls[0][1]).not.toHaveProperty("renterId");
	});
});

describe("/api/inquiries/[id]/messages", () => {
	it("GET 401 / 404 / 200 with ?after=", async () => {
		mockGetCurrentUser.mockResolvedValueOnce(null);
		expect((await listMessages(new Request("http://localhost/x"), ctx)).status).toBe(401);

		mockGetMessagesAfter.mockResolvedValueOnce(null);
		expect((await listMessages(new Request("http://localhost/x"), ctx)).status).toBe(404);

		mockGetMessagesAfter.mockResolvedValueOnce({ messages: [], status: "NEW" });
		const res = await listMessages(new Request("http://localhost/x?after=m1"), ctx);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ messages: [], status: "NEW" });
		expect(mockGetMessagesAfter).toHaveBeenLastCalledWith("inq_1", "user_renter", "m1");
	});

	it("POST 401 when signed out, before reading the body", async () => {
		mockGetCurrentUser.mockResolvedValue(null);
		const res = await sendMessage(json({ body: "Hi" }), ctx);
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "UNAUTHENTICATED" });
		expect(mockPostMessage).not.toHaveBeenCalled();
	});

	it("POST validates the body, then maps outcomes", async () => {
		const empty = await sendMessage(json({ body: "  " }), ctx);
		expect(empty.status).toBe(400);
		expect(await empty.json()).toEqual({ error: "VALIDATION" });

		const message = { id: "m9", body: "Hi", sentAt: "2026-10-06T10:00:00.000Z", fromMe: true, senderName: "Demo Renter" };
		mockPostMessage.mockResolvedValueOnce({ kind: "sent", message });
		const ok = await sendMessage(json({ body: " Hi " }), ctx);
		expect(ok.status).toBe(201);
		expect(await ok.json()).toEqual({ message });
		expect(mockPostMessage).toHaveBeenLastCalledWith("inq_1", "user_renter", "Hi");

		for (const [kind, status, error] of [
			["not-found", 404, "NOT_FOUND"],
			["closed", 409, "THREAD_CLOSED"],
			["rate-limited", 429, "RATE_LIMITED"],
		] as const) {
			mockPostMessage.mockResolvedValueOnce({ kind });
			const res = await sendMessage(json({ body: "Hi" }), ctx);
			expect(res.status).toBe(status);
			expect(await res.json()).toEqual({ error });
		}
	});
});

describe("POST /api/inquiries/[id]/status", () => {
	it("401 when signed out", async () => {
		mockGetCurrentUser.mockResolvedValue(null);
		const res = await statusRoute(json({ action: "close" }), ctx);
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "UNAUTHENTICATED" });
		expect(mockChangeStatus).not.toHaveBeenCalled();
	});

	it("400 for malformed JSON", async () => {
		const res = await statusRoute(new Request("http://localhost/x", { method: "POST", body: "{not json" }), ctx);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "VALIDATION" });
		expect(mockChangeStatus).not.toHaveBeenCalled();
	});

	it("rejects an unknown action", async () => {
		const res = await statusRoute(json({ action: "delete" }), ctx);
		expect(res.status).toBe(400);
		expect(mockChangeStatus).not.toHaveBeenCalled();
	});

	it.each([
		[{ kind: "ok", status: "CLOSED" }, 200, { status: "CLOSED" }],
		[{ kind: "not-found" }, 404, { error: "NOT_FOUND" }],
		[{ kind: "closed" }, 409, { error: "THREAD_CLOSED" }],
		[{ kind: "not-host" }, 400, { error: "NOT_HOST" }],
	])("maps %o to %i", async (outcome, status, body) => {
		mockChangeStatus.mockResolvedValue(outcome);
		const res = await statusRoute(json({ action: "close" }), ctx);
		expect(res.status).toBe(status);
		expect(await res.json()).toEqual(body);
	});
});

describe("notifications", () => {
	const runAfter = async () => {
		for (const cb of afterCallbacks) await cb();
	};

	it("notifies the host after a new or reused inquiry, with the trimmed message", async () => {
		for (const outcome of [{ kind: "created", id: "inq_new" }, { kind: "reused", id: "inq_open" }]) {
			afterCallbacks.length = 0;
			mockNotify.mockReset();
			mockCreateInquiry.mockResolvedValue(outcome);
			await createRoute(json({ ...validBody, message: "  Free next week?  " }));
			await runAfter();
			expect(mockNotify).toHaveBeenCalledWith(outcome.id, "RENTER", "Free next week?");
		}
	});

	it("schedules nothing for spam, validation errors or refused creates", async () => {
		await createRoute(json({ website: "http://spam.example" }));
		await createRoute(json({ ...validBody, requesterName: "" }));
		for (const kind of ["not-found", "own-space", "rate-limited"]) {
			mockCreateInquiry.mockResolvedValue({ kind });
			await createRoute(json(validBody));
		}
		expect(afterCallbacks).toHaveLength(0);
	});

	it("notifies the other side after a sent message, using the sender's role", async () => {
		const message = { id: "m9", body: "Yes", sentAt: "2026-10-07T10:00:00.000Z", fromMe: true, senderName: "Demo Host A" };
		mockPostMessage.mockResolvedValue({ kind: "sent", message, role: "HOST" });
		const res = await sendMessage(json({ body: "Yes" }), ctx);
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({ message }); // role is not leaked into the response
		await runAfter();
		expect(mockNotify).toHaveBeenCalledWith("inq_1", "HOST", "Yes");
	});

	it("schedules nothing when the message isn't sent", async () => {
		mockPostMessage.mockResolvedValue({ kind: "closed" });
		await sendMessage(json({ body: "Hi" }), ctx);
		expect(afterCallbacks).toHaveLength(0);
	});
});
