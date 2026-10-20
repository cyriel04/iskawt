# Slice 7b — Sentry Error Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server and browser errors reach Sentry, scrubbed to an allowlist, so no private data can leave. When no DSN is set, Sentry is fully off.

**Architecture:**
- **One scrubber.** `app/_lib/sentryScrub.ts` is a pure module with `scrubEvent`, `scrubBreadcrumb` and `OPS_MESSAGES`.
- **One options helper.** `app/_lib/sentryOptions.ts` builds the shared init options. Each runtime's config calls `Sentry.init` with them: `sentry.server.config.ts`, `sentry.edge.config.ts` and `instrumentation-client.ts`.
- **Server capture.**
  - `instrumentation.ts` registers the configs and exports `onRequestError`.
  - Ops log lines go through `opsError`, which logs the same line and also captures it in Sentry.
  - `getCurrentUser` sets an opaque user id.
- **Browser capture.** `app/error.tsx` and a new `app/global-error.tsx` capture exceptions.
- **Build.** `next.config.ts` is wrapped in `withSentryConfig`. Source-map upload runs only when `SENTRY_AUTH_TOKEN` is set.

**Tech Stack:** `@sentry/nextjs@11.4.0` (pinned; released 2026-10-02; peer `next ^16`), Next.js 16.4, Jest 30.

**Spec:** `docs/superpowers/specs/2026-10-20-slice-7b-sentry-design.md`. Its allowlist table is binding.

## Global Constraints

- **Branch and commits.** Work on `feat/slice-7b-sentry`, which has no upstream. Commit locally at each commit step, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push or rebase.
- **The new dependency is approved.** Install exactly `@sentry/nextjs@11.4.0` with `pnpm add @sentry/nextjs@11.4.0 --save-exact`. The lockfile changes only through pnpm, never by hand.
  - If pnpm blocks a build script (e.g. `@sentry/cli`), approve it with `pnpm approve-builds`, which writes to `pnpm-workspace.yaml`. Never use `dangerouslyAllowAllBuilds`.
  - No other new dependencies.
- **Check the installed package before relying on any API name in this plan.** Read the typings under `node_modules/@sentry/nextjs` and `node_modules/@sentry/core`. Names to check: `withSentryConfig` from `@sentry/nextjs/config`; the `sourcemaps.disable` and `sourcemaps.deleteSourcemapsAfterUpload` options; `telemetry`; `captureRequestError`; and the `ErrorEvent`, `EventHint`, `Breadcrumb`, `StackFrame` and `Exception` types.
  - If a name differs, use the real one and record the difference in your report.
  - If something the spec relies on doesn't exist, stop and report it.
- **Next.js 16 error boundaries receive `retry`, not `reset`.** For the `global-error.tsx` props, check `node_modules/next/dist/docs/`. Don't rely on memory.
- **Ownership.**
  - Tasks 1 and 2 go to `backend-dev`. Task 2 also edits `next.config.ts` and the root `instrumentation.ts` and `sentry.*.config.ts` files, which are server and config files.
  - Task 3 goes to `frontend-dev`.
  - `types.ts` doesn't change. `.env*` and the README are edited by the main session.
- **Privacy is the point of this slice.**
  - Nothing may reach Sentry outside the spec's allowlist. That means no email, name, address, message body, report detail or application field, and no request body, query string, cookie, header or IP.
  - `user` is `{ id }` only, set on the server. The browser never sets a user.
- **Settings, verbatim:**
  - `dataCollection` with every category off (spec, **SDK data collection**). `sendDefaultPii` doesn't exist in 11.x.
  - `tracesSampleRate: 0`
  - no Replay integration
  - `includeLocalVariables: false` on the server
  - `enabled: Boolean(dsn)`
  - `environment: process.env.VERCEL_ENV ?? "development"`
- **`OPS_MESSAGES`, verbatim:**
  - `[inquiry] notify failed`
  - `[report] notify failed`
  - `[report] no OPS_EMAIL_TO`
  - `[host-application] notify failed`
  - `[host-application] no OPS_EMAIL_TO`
  - `[auth] host link failed`
- **TypeScript strict.** No `any`, no `@ts-ignore`, no non-null `!`.
- **Tests first.** Watch each new test fail before implementing.
- **Commands.**
  - Run one file with `pnpm exec jest "<regex>"`. Then run `pnpm typecheck` and `pnpm lint`.
  - At the end, run `pnpm build` with no Sentry env vars, plus `BETTER_AUTH_SECRET=throwaway-dev-secret-0123456789abcdef BETTER_AUTH_URL=http://localhost:3000`. It must succeed and skip the source-map upload.

## Review Focus

1. **A Prisma error quoting a message body.** The `message.create` validation error carries the body in its message. It must reach Sentry as `PrismaClientValidationError` and nothing more. Test: Task 1.
2. **A server error thrown inside a route that read a request body.** The request body, query string, cookies and headers must not survive scrubbing, even if the SDK attached them. Test: Task 1, a fixture with every request field filled.
3. **A click breadcrumb naming a person.** `ui.click` on "Block Demo Host A" is dropped. A navigation to `/inbox/inq_1?after=m1` keeps only `/inbox/inq_1`. Test: Task 1.
4. **No DSN set.** Local dev, CI and Jest send nothing, and `pnpm build` succeeds without a token. Test: Task 2 asserts `enabled: false` for an undefined DSN, and the build step runs with no Sentry vars.
5. **A crash in the root layout.** `global-error.tsx` renders its own `<html><body>`, reports the error, and shows nothing from `error.message`. Test: Task 3.

---

### Task 1: Install the SDK; the scrubber and the shared options

> **Amended after review:** `sendDefaultPii` doesn't exist in 11.x, so `SharedSentryOptions` uses `dataCollection` instead. The scrubber also forces `sdk.settings.infer_ip: "never"`, keeps `debug_meta.images` and the cause-chain `mechanism` fields, and drops Node-core and undici error messages that quote their input. The spec's **SDK data collection** section and allowlist table are authoritative; the snippets below are the pre-amendment version.

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (through `pnpm add` only), and `pnpm-workspace.yaml` (through `pnpm approve-builds`, only if pnpm asks)
- Create: `app/_lib/sentryScrub.ts`, `app/_lib/sentryScrub.test.ts`
- Create: `app/_lib/sentryOptions.ts`, `app/_lib/sentryOptions.test.ts`

**Interfaces:**
- Produces:

```ts
// app/_lib/sentryScrub.ts
export const OPS_MESSAGES: readonly [
	"[inquiry] notify failed",
	"[report] notify failed",
	"[report] no OPS_EMAIL_TO",
	"[host-application] notify failed",
	"[host-application] no OPS_EMAIL_TO",
	"[auth] host link failed",
];
export type OpsMessage = (typeof OPS_MESSAGES)[number];
export function scrubEvent(event: ErrorEvent, hint?: EventHint): ErrorEvent | null;
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null;
// app/_lib/sentryOptions.ts
export function sentryOptions(dsn: string | undefined): SharedSentryOptions;
export type SharedSentryOptions = {
	dsn: string | undefined;
	enabled: boolean;
	environment: string;
	sendDefaultPii: false;
	tracesSampleRate: 0;
	beforeSend: typeof scrubEvent;
	beforeBreadcrumb: typeof scrubBreadcrumb;
};
```

- [ ] **Step 1: Install**

Run `pnpm add @sentry/nextjs@11.4.0 --save-exact`. If pnpm reports ignored build scripts, run `pnpm approve-builds` and approve only the Sentry packages it lists, normally `@sentry/cli`. Confirm that `package.json` has `"@sentry/nextjs": "11.4.0"`.

Then read the installed typings and confirm the names listed in Global Constraints.

- [ ] **Step 2: Write the failing scrubber tests**

`app/_lib/sentryScrub.test.ts`:

```ts
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
```

`app/_lib/sentryOptions.test.ts`:

```ts
/** @jest-environment node */
import { scrubBreadcrumb, scrubEvent } from "@/app/_lib/sentryScrub";
import { sentryOptions } from "@/app/_lib/sentryOptions";

it("is off without a DSN and on with one; never PII, never tracing", () => {
	expect(sentryOptions(undefined)).toMatchObject({ dsn: undefined, enabled: false });
	expect(sentryOptions("")).toMatchObject({ enabled: false });
	expect(sentryOptions("https://k@o1.ingest.sentry.io/1")).toMatchObject({
		enabled: true,
		sendDefaultPii: false,
		tracesSampleRate: 0,
		beforeSend: scrubEvent,
		beforeBreadcrumb: scrubBreadcrumb,
	});
});

it("takes the environment from VERCEL_ENV, defaulting to development", () => {
	const before = process.env.VERCEL_ENV;
	delete process.env.VERCEL_ENV;
	expect(sentryOptions(undefined).environment).toBe("development");
	process.env.VERCEL_ENV = "production";
	expect(sentryOptions(undefined).environment).toBe("production");
	if (before === undefined) delete process.env.VERCEL_ENV;
	else process.env.VERCEL_ENV = before;
});
```

Run: `pnpm exec jest "sentryScrub|sentryOptions"`. Expected: FAIL, because the modules don't exist yet.

The fixtures must typecheck against the installed `ErrorEvent` and `Breadcrumb` types. If a fixture field isn't in the type (e.g. `server_name`), keep it. If the type rejects it, build the fixture as a plain object and pass it through `JSON.parse(JSON.stringify(...))` typed as `ErrorEvent`, and report that you did. Don't drop fields from the fixture.

- [ ] **Step 3: Implement `sentryScrub.ts`**

```ts
// What may leave for Sentry. An allowlist: every event and breadcrumb is rebuilt
// from the fields listed in docs/superpowers/specs/2026-10-20-slice-7b-sentry-design.md,
// and anything else is dropped. Pure; shared by the server, edge and browser configs.

import type { Breadcrumb, ErrorEvent, EventHint, Exception, StackFrame } from "@sentry/nextjs";

export const OPS_MESSAGES = [
	"[inquiry] notify failed",
	"[report] notify failed",
	"[report] no OPS_EMAIL_TO",
	"[host-application] notify failed",
	"[host-application] no OPS_EMAIL_TO",
	"[auth] host link failed",
] as const;
export type OpsMessage = (typeof OPS_MESSAGES)[number];

const isOpsMessage = (value: unknown): value is OpsMessage =>
	typeof value === "string" && (OPS_MESSAGES as readonly string[]).includes(value);

const EXTRA_KEYS: readonly string[] = ["inquiryId", "reportId", "applicationId", "userId", "status"];
const TAG_KEYS: readonly string[] = ["runtime", "route"];
const CONTEXT_KEYS = ["runtime", "os", "browser", "device"] as const;
const ENGINE_ERRORS: readonly string[] = ["TypeError", "ReferenceError", "RangeError"];
const REMOVED = "[message removed]";

// "https://h/p?q" → "https://h/p"; "/p?q" → "/p". Anything unparseable is dropped.
function withoutQuery(url: unknown, keepOrigin: boolean): string | undefined {
	if (typeof url !== "string" || url === "") return undefined;
	try {
		const parsed = new URL(url, "http://relative.invalid");
		return keepOrigin && !url.startsWith("/") ? `${parsed.origin}${parsed.pathname}` : parsed.pathname;
	} catch {
		return undefined;
	}
}

function pick<T extends Record<string, unknown>>(source: T | undefined, keys: readonly string[], ok: (v: unknown) => boolean): Partial<T> | undefined {
	if (!source) return undefined;
	const out: Partial<T> = {};
	for (const key of keys) {
		if (key in source && ok(source[key])) out[key as keyof T] = source[key as keyof T];
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

const shortScalar = (v: unknown) => (typeof v === "string" && v.length <= 64) || typeof v === "number";

function prismaCode(original: unknown): string | undefined {
	if (typeof original !== "object" || original === null || !("code" in original)) return undefined;
	return typeof original.code === "string" ? original.code : undefined;
}

function safeValue(exception: Exception, original: unknown): string | undefined {
	const { type, value } = exception;
	if (type?.startsWith("PrismaClient")) {
		const code = original instanceof Error && original.name === type ? prismaCode(original) : undefined;
		return code ? `${type} ${code}` : type;
	}
	if (value === undefined) return undefined;
	if (type && ENGINE_ERRORS.includes(type) && value.length <= 200) return value;
	return REMOVED;
}

const frame = ({ filename, function: fn, lineno, colno, in_app, module }: StackFrame): StackFrame => ({
	filename,
	function: fn,
	lineno,
	colno,
	in_app,
	module,
});

function exception(e: Exception, original: unknown): Exception {
	return {
		type: e.type,
		value: safeValue(e, original),
		mechanism: e.mechanism ? { type: e.mechanism.type, handled: e.mechanism.handled } : undefined,
		stacktrace: e.stacktrace?.frames ? { frames: e.stacktrace.frames.map(frame) } : undefined,
	};
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
	const { category, type, data, timestamp, level } = breadcrumb;
	if (category === "navigation") {
		return { category, timestamp, level, data: { from: withoutQuery(data?.from, false), to: withoutQuery(data?.to, false) } };
	}
	if (category === "fetch" || category === "xhr") {
		return {
			category,
			type,
			timestamp,
			level,
			data: { method: data?.method, url: withoutQuery(data?.url, false), status_code: data?.status_code },
		};
	}
	return null;
}

export function scrubEvent(event: ErrorEvent, hint?: EventHint): ErrorEvent | null {
	if (event.message !== undefined && !isOpsMessage(event.message)) return null;
	const original = hint?.originalException;
	const user = event.user?.id !== undefined ? { id: event.user.id } : undefined;
	const contexts = event.contexts
		? Object.fromEntries(CONTEXT_KEYS.filter((key) => event.contexts?.[key]).map((key) => [key, event.contexts?.[key]]))
		: undefined;
	const scrubbed: ErrorEvent = {
		type: undefined,
		event_id: event.event_id,
		level: event.level,
		platform: event.platform,
		timestamp: event.timestamp,
		release: event.release,
		environment: event.environment,
		fingerprint: event.fingerprint,
		transaction: event.transaction?.split("?")[0],
		sdk: event.sdk,
		message: event.message,
		exception: event.exception?.values ? { values: event.exception.values.map((e) => exception(e, original)) } : undefined,
		request: event.request ? { method: event.request.method, url: withoutQuery(event.request.url, true) } : undefined,
		user,
		extra: pick(event.extra, EXTRA_KEYS, shortScalar),
		tags: pick(event.tags, TAG_KEYS, shortScalar),
		contexts: contexts && Object.keys(contexts).length > 0 ? contexts : undefined,
		breadcrumbs: event.breadcrumbs?.map(scrubBreadcrumb).filter((b): b is Breadcrumb => b !== null),
	};
	// Drop undefined keys so the event is exactly the allowlist.
	return JSON.parse(JSON.stringify(scrubbed)) as ErrorEvent;
}
```

The final `JSON.parse(JSON.stringify(...)) as ErrorEvent` strips `undefined` keys. It's the one cast in this file, applied to a value already typed as `ErrorEvent`. If lint objects, replace it with an explicit loop that removes undefined keys.

If the installed types make `pick`'s `out[key as keyof T]` unacceptable to the linter, write the two picks out as loops over explicit keys instead. No `any`.

- [ ] **Step 4: Implement `sentryOptions.ts`**

```ts
// The init options every runtime shares. Off without a DSN, so local dev, CI
// and tests send nothing. Errors only: no tracing, no PII from the SDK.

import { scrubBreadcrumb, scrubEvent } from "@/app/_lib/sentryScrub";

export type SharedSentryOptions = {
	dsn: string | undefined;
	enabled: boolean;
	environment: string;
	sendDefaultPii: false;
	tracesSampleRate: 0;
	beforeSend: typeof scrubEvent;
	beforeBreadcrumb: typeof scrubBreadcrumb;
};

export function sentryOptions(dsn: string | undefined): SharedSentryOptions {
	return {
		dsn: dsn || undefined,
		enabled: Boolean(dsn),
		environment: process.env.VERCEL_ENV ?? "development",
		sendDefaultPii: false,
		tracesSampleRate: 0,
		beforeSend: scrubEvent,
		beforeBreadcrumb: scrubBreadcrumb,
	};
}
```

`sentryOptions("")` returns `dsn: undefined`, and the test only checks `enabled: false` for that case.

- [ ] **Step 5: Run the tests and watch them pass**

Run `pnpm exec jest "sentryScrub|sentryOptions"`, then `pnpm typecheck` and `pnpm lint`. Expected: PASS and clean.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml app/_lib/sentryScrub.ts app/_lib/sentryScrub.test.ts app/_lib/sentryOptions.ts app/_lib/sentryOptions.test.ts
git commit -m "feat(sentry): the SDK, and an allowlist scrubber for every event and breadcrumb

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Server wiring

**Files:**
- Create: `instrumentation.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` (all at the repo root)
- Modify: `next.config.ts`
- Create: `app/_lib/server/opsLog.ts`, `app/_lib/server/opsLog.test.ts`
- Modify: `app/_lib/server/inquiryNotify.ts` (2 call sites), `reportNotify.ts` (2), `hostApplicationNotify.ts` (2), `authHooks.ts` (1)
- Modify: `app/_lib/server/currentUser.ts`, `app/_lib/server/currentUser.test.ts`

**Interfaces:**
- Consumes: `sentryOptions`, `OpsMessage` and `OPS_MESSAGES` from Task 1.
- Produces: `opsError(message: OpsMessage, extra?: Record<string, string | number>): void`.

- [ ] **Step 1: Write the failing tests**

`app/_lib/server/opsLog.test.ts`:

```ts
/** @jest-environment node */
const mockCapture = jest.fn();
jest.mock("@sentry/nextjs", () => ({ captureMessage: (...a: unknown[]) => mockCapture(...a) }));

import { opsError } from "@/app/_lib/server/opsLog";

let errorSpy: jest.SpyInstance;
beforeEach(() => {
	mockCapture.mockReset();
	errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

it("logs the same line as before and captures it in Sentry with the same data", () => {
	opsError("[inquiry] notify failed", { inquiryId: "inq_1", status: 503 });
	expect(errorSpy).toHaveBeenCalledWith("[inquiry] notify failed", { inquiryId: "inq_1", status: 503 });
	expect(mockCapture).toHaveBeenCalledWith("[inquiry] notify failed", { level: "error", extra: { inquiryId: "inq_1", status: 503 } });
});

it("logs a bare line when there's no extra", () => {
	opsError("[report] no OPS_EMAIL_TO");
	expect(errorSpy).toHaveBeenCalledWith("[report] no OPS_EMAIL_TO");
	expect(mockCapture).toHaveBeenCalledWith("[report] no OPS_EMAIL_TO", { level: "error", extra: undefined });
});
```

In `app/_lib/server/currentUser.test.ts`:
- add `const mockSetUser = jest.fn(); jest.mock("@sentry/nextjs", () => ({ setUser: (...a: unknown[]) => mockSetUser(...a) }));` at the top;
- add `mockSetUser.mockReset()` to the existing `beforeEach`;
- add these tests, using the file's existing session and row mocks:
  - after a found user: `expect(mockSetUser).toHaveBeenCalledWith({ id: <the user's id> })`, and `expect(JSON.stringify(mockSetUser.mock.calls)).not.toContain("@")`;
  - with no session: `expect(mockSetUser).toHaveBeenCalledWith(null)`;
  - with a session but no row: `expect(mockSetUser).toHaveBeenCalledWith(null)`.

Run: `pnpm exec jest "opsLog|currentUser"`. Expected: FAIL.

- [ ] **Step 2: Implement `opsLog.ts`**

```ts
// The server's ops log lines: written to the console as before, and sent to
// Sentry with the same id-only data. Only the fixed OPS_MESSAGES are allowed;
// the scrubber drops any other message event.

import * as Sentry from "@sentry/nextjs";
import type { OpsMessage } from "@/app/_lib/sentryScrub";

export function opsError(message: OpsMessage, extra?: Record<string, string | number>): void {
	if (extra) console.error(message, extra);
	else console.error(message);
	Sentry.captureMessage(message, { level: "error", extra });
}
```

- [ ] **Step 3: Switch the 7 call sites**

Replace each `console.error(...)` with `opsError(...)`, using the same text and the same object:
- `inquiryNotify.ts`: the `fail` helper becomes `const fail = (inquiryId: string) => opsError("[inquiry] notify failed", { inquiryId });`, and the status line becomes `opsError("[inquiry] notify failed", { inquiryId, status: Number(match[1]) });`.
- `reportNotify.ts`: `opsError("[report] no OPS_EMAIL_TO")` and `opsError("[report] notify failed", { reportId })`.
- `hostApplicationNotify.ts`: `opsError("[host-application] no OPS_EMAIL_TO")` and `opsError("[host-application] notify failed", { applicationId: notice.applicationId })`.
- `authHooks.ts`: `opsError("[auth] host link failed", { userId: session.userId })`.

Each file imports `opsError` from `@/app/_lib/server/opsLog`.

These files' existing tests spy on `console.error` and must pass **unchanged**. If one fails only because importing the real `@sentry/nextjs` breaks under Jest, add a root `__mocks__/@sentry/nextjs.ts` (Jest uses it automatically for node modules). It should export `jest.fn()` for `captureMessage`, `captureException`, `captureRequestError`, `setUser` and `init`. Report that you added it. Don't edit the existing assertions.

- [ ] **Step 4: Set the user in `getCurrentUser`**

In `app/_lib/server/currentUser.ts`, add `import * as Sentry from "@sentry/nextjs";`. Change the comment to add: `Sets Sentry's user to the opaque id only, never the email or name.` Then:
- before `if (!session) return null;`, write the null case as `if (!session) { Sentry.setUser(null); return null; }`;
- do the same for `if (!row) return null;`;
- before the final `return`, add `Sentry.setUser({ id: row.id });`.

Run: `pnpm exec jest "opsLog|currentUser|inquiryNotify|reportNotify|hostApplicationNotify|authHooks"`. Expected: PASS.

- [ ] **Step 5: Runtime configs and instrumentation**

`sentry.server.config.ts`:

```ts
// Sentry on the Node server. Options are shared and scrubbed; see app/_lib/sentryOptions.ts.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/app/_lib/sentryOptions";

Sentry.init({ ...sentryOptions(process.env.SENTRY_DSN), includeLocalVariables: false });
```

`sentry.edge.config.ts`:

```ts
// Sentry on the edge runtime. Options are shared and scrubbed; see app/_lib/sentryOptions.ts.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/app/_lib/sentryOptions";

Sentry.init(sentryOptions(process.env.SENTRY_DSN));
```

`instrumentation.ts`:

```ts
// Registers Sentry for the server and edge runtimes, and captures errors from
// route handlers, server components and proxies. Off without SENTRY_DSN.
import * as Sentry from "@sentry/nextjs";

export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
	if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

export const onRequestError = Sentry.captureRequestError;
```

If `includeLocalVariables` isn't a valid option in the installed edge or node types, keep it on the server config only, as shown. If it isn't valid for node either, drop it and report that. The SDK's default is already off.

- [ ] **Step 6: `next.config.ts`**

```ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
	reactCompiler: true,
};

// Source maps upload only when SENTRY_AUTH_TOKEN is set (Vercel production);
// local and CI builds skip it. Maps are deleted from the public output after upload.
export default withSentryConfig(nextConfig, {
	org: process.env.SENTRY_ORG,
	project: process.env.SENTRY_PROJECT,
	authToken: process.env.SENTRY_AUTH_TOKEN,
	silent: !process.env.CI,
	telemetry: false,
	sourcemaps: {
		disable: !process.env.SENTRY_AUTH_TOKEN,
		deleteSourcemapsAfterUpload: true,
	},
});
```

Keep `reactCompiler: true` and whatever else is already in `nextConfig`. If the import path or the option names differ in 11.4.0, use the installed ones and report it.

- [ ] **Step 7: Full checks**

Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Then run `pnpm build` with only the throwaway auth env, and **no** `SENTRY_*` vars. Expected:
- all clean;
- the build succeeds;
- no upload is attempted, or a "skipped" notice is printed;
- nothing fails for want of a token.

Paste the build's Sentry-related output lines into your report.

- [ ] **Step 8: Commit**

```bash
git add instrumentation.ts sentry.server.config.ts sentry.edge.config.ts next.config.ts app/_lib/server/opsLog.ts app/_lib/server/opsLog.test.ts app/_lib/server/inquiryNotify.ts app/_lib/server/reportNotify.ts app/_lib/server/hostApplicationNotify.ts app/_lib/server/authHooks.ts app/_lib/server/currentUser.ts app/_lib/server/currentUser.test.ts
git commit -m "feat(sentry): server and edge capture, ops log lines, and an opaque user id

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If you added `__mocks__/@sentry/nextjs.ts`, add it to this commit too.

---

### Task 3: Browser wiring (`frontend-dev`)

**Files:**
- Create: `instrumentation-client.ts` (repo root)
- Modify: `app/error.tsx`
- Create: `app/global-error.tsx`
- Test: `app/error.test.tsx` (create, or extend if it exists), `app/global-error.test.tsx`

**Interfaces:**
- Consumes: `sentryOptions` (Task 1) and `Sentry.captureException`.

- [ ] **Step 1: Write the failing tests**

`app/global-error.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCapture = jest.fn();
jest.mock("@sentry/nextjs", () => ({ captureException: (...a: unknown[]) => mockCapture(...a) }));

import GlobalError from "@/app/global-error";

const SECRET = "Invalid prisma.message.create() { body: 'Free on the 20th?' }";

beforeEach(() => mockCapture.mockReset());

it("reports the error to Sentry and shows nothing from it", () => {
	const error = Object.assign(new Error(SECRET), { digest: "d1" });
	render(<GlobalError error={error} retry={() => {}} />, { container: document.documentElement });
	expect(mockCapture).toHaveBeenCalledWith(error);
	expect(screen.getByText("Something went wrong")).toBeInTheDocument();
	expect(document.body.textContent).not.toContain("Free on the 20th");
});

it("offers Try again", async () => {
	const retry = jest.fn();
	render(<GlobalError error={new Error("x")} retry={retry} />, { container: document.documentElement });
	await userEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(retry).toHaveBeenCalled();
});
```

`global-error.tsx` renders `<html>`. If rendering into `document.documentElement` warns or fails in jsdom, render it normally and silence only the "validateDOMNesting" warning with a scoped `console.error` spy in this file. Report what you did.

Use the prop name for retry that `node_modules/next/dist/docs/` documents for `global-error` in this Next version. If it isn't `retry`, change it in both the test and the component, and report it.

For `app/error.tsx`, write the same two tests against `ErrorPage`, using `renderWithTheme` from `@/app/_components/testing`. Assert `captureException` is called with the error, and that `error.message` isn't rendered.

Run: `pnpm exec jest "app/error|global-error"`. Expected: FAIL.

- [ ] **Step 2: `instrumentation-client.ts`**

```ts
// Sentry in the browser: errors only, scrubbed by the shared allowlist. No
// tracing, no Replay, and no user: the browser never sends an id. Off without
// NEXT_PUBLIC_SENTRY_DSN.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/app/_lib/sentryOptions";

Sentry.init(sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));
```

Don't add `replayIntegration` or `browserTracingIntegration`, and don't export `onRouterTransitionStart`, which is for tracing.

- [ ] **Step 3: `app/error.tsx`**

Add `import { useEffect } from "react";` and `import * as Sentry from "@sentry/nextjs";`. Inside the component, add `useEffect(() => { Sentry.captureException(error); }, [error]);`. The component now uses `error`, so destructure it: `{ error, retry }`.

Replace the comment with:

```tsx
// Reports the error to Sentry (scrubbed to an allowlist; see app/_lib/sentryScrub.ts)
// but never renders it: in development its message can carry query details.
```

- [ ] **Step 4: `app/global-error.tsx`**

```tsx
"use client"; // error boundaries must be client components

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import styles from "@/app/_styles/message.module.scss";

// The root layout itself failed, so there is no theme and no layout: this
// renders its own <html> and <body>. Plain elements, styled by the shared
// message module (its tokens fall back gracefully without the theme's CSS
// variables). Reports to Sentry; never renders the error.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
	useEffect(() => {
		Sentry.captureException(error);
	}, [error]);

	return (
		<html lang="en">
			<body>
				<main className={styles.screen}>
					<h1>Something went wrong</h1>
					<p>We couldn&apos;t load this page just now. The problem is on our side, not yours.</p>
					<button type="button" onClick={() => retry()}>
						Try again
					</button>
				</main>
			</body>
		</html>
	);
}
```

The `<button>` needs a 44px target, but a plain element can't take an MUI class. Add `.button { min-height: 44px; padding-inline: space(4); }` to `app/_styles/message.module.scss`, and give the button `className={styles.button}`. That file is frontend-owned.

- [ ] **Step 5: Run the checks**

Run `pnpm exec jest "app/error|global-error"`, then `pnpm test`, `pnpm typecheck` and `pnpm lint`. Then run `pnpm build` with only the throwaway auth env. Expected: everything clean.

- [ ] **Step 6: Commit**

```bash
git add instrumentation-client.ts app/error.tsx app/global-error.tsx app/error.test.tsx app/global-error.test.tsx app/_styles/message.module.scss
git commit -m "feat(sentry): browser capture and a root-layout error boundary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**After Task 3, the main session** adds the following to `.env.example` and the README:
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN` (noted as a secret)
