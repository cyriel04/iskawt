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
	fingerprint: ["{{ default }}", "inquiry-post"],
	sdk: {
		name: "sentry.javascript.nextjs",
		version: "11.4.0",
		integrations: ["InboundFilters"],
		packages: [{ name: "npm:@sentry/nextjs", version: "11.4.0" }],
		settings: { infer_ip: "auto" },
	},
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
		platform: "node",
		timestamp: 1760000000,
		fingerprint: ["{{ default }}", "inquiry-post"],
		sdk: { name: "sentry.javascript.nextjs", version: "11.4.0" },
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

it("forces IP inference off, whatever the SDK sent", () => {
	expect(scrubEvent(leaky())?.sdk).toEqual({
		name: "sentry.javascript.nextjs",
		version: "11.4.0",
		integrations: ["InboundFilters"],
		packages: [{ name: "npm:@sentry/nextjs", version: "11.4.0" }],
		settings: { infer_ip: "never" },
	});
	expect(scrubEvent({ type: undefined })?.sdk).toEqual({ settings: { infer_ip: "never" } });
});

it("drops allowed extra and tag keys whose values are too long or not scalars", () => {
	const out = scrubEvent({
		type: undefined,
		extra: { inquiryId: "i".repeat(65), status: { code: 503, body: BODY } },
		tags: { route: "r".repeat(65) },
	});
	expect(out?.extra).toBeUndefined();
	expect(out?.tags).toBeUndefined();
});

it("keeps debug_meta images as type, code_file and debug_id only", () => {
	// A non-literal, so the extra field reaches the scrubber as the SDK could send it.
	const image = { type: "sourcemap" as const, code_file: "app:///_next/server/chunks/1.js", debug_id: "dbg-1", note: EMAIL };
	const out = scrubEvent({ type: undefined, debug_meta: { images: [image] } });
	expect(out?.debug_meta).toEqual({
		images: [{ type: "sourcemap", code_file: "app:///_next/server/chunks/1.js", debug_id: "dbg-1" }],
	});
	expect(JSON.stringify(out)).not.toContain(EMAIL);
});

it("keeps the cause-chain fields of a linked error's mechanism", () => {
	const out = scrubEvent({
		type: undefined,
		exception: {
			values: [
				{ type: "Error", value: BODY, mechanism: { type: "chained", source: "cause", exception_id: 1, parent_id: 0, handled: true, synthetic: true, data: { body: BODY } } },
				{ type: "Error", value: EMAIL, mechanism: { type: "onRequestError", handled: false, exception_id: 0, is_exception_group: false } },
			],
		},
	});
	expect(out?.exception?.values?.map((e) => e.mechanism)).toEqual([
		{ type: "chained", source: "cause", exception_id: 1, parent_id: 0, handled: true },
		{ type: "onRequestError", handled: false, exception_id: 0, is_exception_group: false },
	]);
	expect(JSON.stringify(out)).not.toContain(BODY);
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

	// Engine messages are an allowlist of three V8 templates; everything else is removed.
	it.each([
		["TypeError", "Cannot read properties of undefined (reading 'title')"],
		["TypeError", "Cannot read properties of null (reading 'id')"],
		["ReferenceError", "foo is not defined"],
		["TypeError", "thread.messages.map is not a function"],
		["TypeError", "router.refresh(...) is not a function"],
	])("keeps the %s template %p exactly", (type, value) => {
		expect(scrubEvent(withException(type, value))?.exception?.values?.[0]?.value).toBe(value);
	});

	// Real V8 and Node strings that quote or embed a runtime value.
	it.each([
		["TypeError", "Cannot read properties of null (reading 'It's free, call 0917')"],
		["TypeError", "Cannot assign to read only property '0' of string 'It's free, call 0917'"],
		["TypeError", 'string "Free on the 20th? Call 0917" is not a function'],
		["TypeError", "Cannot create property 'foo' on string 'Free on the 20th? Call 0917'"],
		["TypeError", "Cannot use 'in' operator to search for 'k' in Free on the 20th? Call 0917"],
		["TypeError", "Cannot read properties of null (reading 'Free on the 20th?')"],
		["TypeError", "Iterator value Free on the 20th? is not an entry object"],
		["TypeError", "Promise resolver Free on the 20th? is not a function"],
		["TypeError", "Object prototype may only be an Object or null: Free on the 20th?"],
		["TypeError", "Cannot add property Free, object is not extensible"],
		["TypeError", `Cannot redefine property: ${EMAIL}`],
		["RangeError", "Invalid time zone specified: Free on the 20th?"],
		["RangeError", "Invalid currency code : Free"],
		["TypeError", 'The "path" argument must be of type string. Received type number (42)'],
		["TypeError", `Failed to parse URL from http://x y/?email=${EMAIL}`],
	])("removes the %s message %p", (type, value) => {
		expect(scrubEvent(withException(type, value))?.exception?.values?.[0]?.value).toBe("[message removed]");
	});

	it("removes a template message when the type is not an engine error", () => {
		expect(scrubEvent(withException("Error", "foo is not defined"))?.exception?.values?.[0]?.value).toBe("[message removed]");
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

	it("reduces an absolute navigation URL to its path, dropping credentials and query", () => {
		expect(scrubBreadcrumb({ category: "navigation", data: { from: "/inbox", to: "https://u:p@iskawt.example/inbox?x=1" } })).toEqual({
			category: "navigation",
			data: { from: "/inbox", to: "/inbox" },
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
