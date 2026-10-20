/** @jest-environment node */
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import { OPS_MESSAGES, scrubBreadcrumb, scrubEvent } from "@/app/_lib/sentryScrub";

// Demo private data. None of it may survive.
const EMAIL = "demo-host@example.invalid";
const ADDRESS = "[UNIT NO.] [BUILDING NAME], Demo Street, Poblacion, Makati";
const BODY = "Free on the 20th? Call me on 0917 000 0000";
const DETAIL = "Asked for a deposit by bank transfer";
const SECRETS = [EMAIL, ADDRESS, BODY, DETAIL, "0917", "session_token", "after=m1"];

const leaky = (): ErrorEvent => ({
	type: undefined,
	event_id: "evt_1",
	level: "error",
	platform: "node",
	timestamp: 1760000000,
	release: "abc123",
	environment: "production",
	transaction: "POST /api/inquiries/[id]/messages?after=m1",
	server_name: "host-1",
	exception: {
		values: [
			{
				type: "Error",
				value: `Failed for ${EMAIL}: ${BODY}`,
				mechanism: { type: "onRequestError", handled: false, data: { body: BODY } },
				stacktrace: {
					frames: [
						{
							filename: "app/_lib/server/inquiryWrites.ts",
							function: "postMessage",
							lineno: 120,
							colno: 7,
							in_app: true,
							module: "inquiryWrites",
							vars: { body: BODY, email: EMAIL },
							pre_context: [`const body = "${BODY}"`],
							context_line: `await send("${EMAIL}")`,
							post_context: [ADDRESS],
						},
					],
				},
			},
		],
	},
	request: {
		method: "POST",
		url: "https://iskawt.example/api/inquiries/inq_1/messages?after=m1",
		query_string: "after=m1",
		data: { body: BODY, address: ADDRESS },
		cookies: { session_token: "session_token" },
		headers: { cookie: "session_token=x", "x-user-email": EMAIL },
		env: { REMOTE_ADDR: "203.0.113.7" },
	},
	user: { id: "user_1", email: EMAIL, username: "Demo Host", ip_address: "203.0.113.7" },
	extra: { inquiryId: "inq_1", status: 503, body: BODY, detail: DETAIL, long: "x".repeat(65) },
	tags: { runtime: "node", route: "/api/inquiries/[id]/messages", email: EMAIL },
	contexts: {
		runtime: { name: "node", version: "22" },
		os: { name: "Linux" },
		state: { state: { type: "redux", value: { address: ADDRESS } } },
		custom: { detail: DETAIL },
	},
	breadcrumbs: [
		{ category: "console", message: `logged ${EMAIL}` },
		{ category: "ui.click", message: "button[aria-label='Block Demo Host A']" },
		{ category: "navigation", data: { from: "/spaces/demo", to: "/inbox/inq_1?after=m1" } },
		{ category: "fetch", type: "http", data: { method: "POST", url: "/api/inquiries/inq_1/messages?after=m1", status_code: 201, request_body: BODY } },
	],
});

it("lets none of the private data through, in any field", () => {
	const out = JSON.stringify(scrubEvent(leaky()));
	for (const secret of SECRETS) expect(out).not.toContain(secret);
	expect(out).not.toContain("203.0.113.7");
	expect(out).not.toContain("host-1");
});

it("keeps the allowlisted fields", () => {
	const out = scrubEvent(leaky());
	expect(out).toMatchObject({
		event_id: "evt_1",
		level: "error",
		release: "abc123",
		environment: "production",
		transaction: "POST /api/inquiries/[id]/messages",
		request: { method: "POST", url: "https://iskawt.example/api/inquiries/inq_1/messages" },
		user: { id: "user_1" },
		extra: { inquiryId: "inq_1", status: 503 },
		tags: { runtime: "node", route: "/api/inquiries/[id]/messages" },
		contexts: { runtime: { name: "node", version: "22" }, os: { name: "Linux" } },
	});
	expect(out?.user).toEqual({ id: "user_1" });
	expect(Object.keys(out?.extra ?? {}).sort()).toEqual(["inquiryId", "status"]);
	expect(Object.keys(out?.contexts ?? {}).sort()).toEqual(["os", "runtime"]);
	const exception = out?.exception?.values?.[0];
	expect(exception?.type).toBe("Error");
	expect(exception?.value).toBe("[message removed]");
	expect(exception?.mechanism).toEqual({ type: "onRequestError", handled: false });
	expect(exception?.stacktrace?.frames?.[0]).toEqual({
		filename: "app/_lib/server/inquiryWrites.ts",
		function: "postMessage",
		lineno: 120,
		colno: 7,
		in_app: true,
		module: "inquiryWrites",
	});
	expect(out?.breadcrumbs).toEqual([
		{ category: "navigation", data: { from: "/spaces/demo", to: "/inbox/inq_1" } },
		{ category: "fetch", type: "http", data: { method: "POST", url: "/api/inquiries/inq_1/messages", status_code: 201 } },
	]);
});

describe("exception messages", () => {
	const withException = (type: string, value: string): ErrorEvent => ({ type: undefined, exception: { values: [{ type, value }] } });

	it.each([
		["PrismaClientValidationError", undefined, "PrismaClientValidationError"],
		["PrismaClientKnownRequestError", "P2002", "PrismaClientKnownRequestError P2002"],
	])("reduces %s to its name and code", (name, code, expected) => {
		const original = Object.assign(new Error(`Invalid \`prisma.message.create()\` invocation: { body: "${BODY}" }`), { name, code });
		const out = scrubEvent(withException(name, original.message), { originalException: original });
		expect(out?.exception?.values?.[0]?.value).toBe(expected);
		expect(JSON.stringify(out)).not.toContain(BODY);
	});

	it.each(["TypeError", "ReferenceError", "RangeError"])("keeps a short %s engine message", (type) => {
		const value = "Cannot read properties of undefined (reading 'title')";
		expect(scrubEvent(withException(type, value))?.exception?.values?.[0]?.value).toBe(value);
	});

	it("removes a long engine message", () => {
		expect(scrubEvent(withException("TypeError", "x".repeat(201)))?.exception?.values?.[0]?.value).toBe("[message removed]");
	});

	it.each([
		["SyntaxError", `Unexpected token 'F', "${BODY}" is not valid JSON`],
		["Error", `Resend responded 503 for ${EMAIL}`],
		["AbortError", "The operation was aborted"],
	])("removes a %s message", (type, value) => {
		expect(scrubEvent(withException(type, value))?.exception?.values?.[0]?.value).toBe("[message removed]");
	});
});

describe("message events", () => {
	it.each(OPS_MESSAGES)("keeps the ops message %p with its id-only extra", (message) => {
		const out = scrubEvent({ type: undefined, message, extra: { inquiryId: "inq_1", body: BODY } });
		expect(out?.message).toBe(message);
		expect(out?.extra).toEqual({ inquiryId: "inq_1" });
	});

	it("drops any other message event entirely", () => {
		expect(scrubEvent({ type: undefined, message: `user said ${BODY}` })).toBeNull();
	});
});

describe("scrubBreadcrumb", () => {
	it.each<Breadcrumb>([
		{ category: "console", message: EMAIL },
		{ category: "ui.click", message: "button 'Block Demo Host A'" },
		{ category: "ui.input", message: ADDRESS },
		{ category: "http", data: { url: "https://api.resend.com/emails" } },
		{ message: "no category" },
	])("drops %o", (crumb) => {
		expect(scrubBreadcrumb(crumb)).toBeNull();
	});

	it("keeps navigation paths without queries", () => {
		expect(scrubBreadcrumb({ category: "navigation", data: { from: "/sign-in?next=%2Finbox", to: "/inbox" } })).toEqual({
			category: "navigation",
			data: { from: "/sign-in", to: "/inbox" },
		});
	});

	it("keeps fetch and xhr as method, path and status only", () => {
		expect(scrubBreadcrumb({ category: "xhr", type: "http", data: { method: "GET", url: "https://iskawt.example/api/x?y=1", status_code: 200, body: BODY } })).toEqual({
			category: "xhr",
			type: "http",
			data: { method: "GET", url: "/api/x", status_code: 200 },
		});
	});
});
