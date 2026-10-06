# Slice 5b-2 — Inquiry Form and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in renter sends an inquiry from a listing page. A signed-out visitor is sent to sign in and lands back on the same listing, and a host viewing their own listing sees a note instead of the form. Every new message emails the other side, at most once per 10 minutes per side per thread.

**Architecture:**
- **Backend:**
  - adds `isHostOfSpace()`;
  - adds a pure email builder;
  - adds `notifyCounterpart()`, which claims the throttle slot atomically with a conditional `updateMany` and then sends through the 5a `Mailer`;
  - schedules notifications with Next's `after()`, so they never delay or fail the response.
- **Frontend:**
  - adds `next` support to `/sign-in`, with an open-redirect guard;
  - adds a server `InquiryPanel` that picks one of three variants;
  - adds a client `InquiryForm` that validates with the shared `validateNewInquiry` before posting.

**Tech Stack:**
- Next.js 16.3.8: route handlers, `after` from `next/server`.
- Prisma 7.10.
- MUI 9 + SCSS modules.
- Jest 30 + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-06-slice-5b-threads-design.md`, especially **Notifications**, **Pages → `/spaces/[slug]` inquiry panel**, and **Carried forward from the 5b-1 review**. Also `CLAUDE.md`.

## Global Constraints

- **Ownership.**
  - Tasks 1–4 go to `backend-dev`.
  - Tasks 5–7 go to `frontend-dev`.
  - Run them in that order: Task 7 consumes Task 1.
  - `app/_lib/types.ts` doesn't change in this PR.
- **Commits and pushes.**
  - Commit locally on `feat/slice-5b-2-inquiry-form` at each commit step, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - If you judge the user's global rule forbids that, leave the work uncommitted and list the files per task; the main session commits.
  - Never push, never rebase.
- **Off limits:**
  - No new dependencies.
  - Never edit `prisma/**`. There is no schema change in this PR.
  - Never edit lockfiles or `.env*`.
- **Privacy.**
  - `Host.contactEmail` and `User.email` are read only by `inquiryNotify.ts`, only to address an email.
  - They never reach a component, a response or a log line.
  - Emails contain the sender's display name, the space title and the message text, and never anyone's email or phone.
  - Logs carry the inquiry id only.
- **Notification failures** never change the HTTP response.
- **TypeScript strict.** No `any`, no `@ts-ignore`, no non-null `!`.
- **Styling.**
  - SCSS modules and tokens only. No `sx`, `styled()` or `style={{}}`.
  - Touch targets at least 44px, labelled inputs.
  - `"use client"` only on `InquiryForm`.
- **Tests come first.** Watch each new test fail before implementing.
- **Commands:**
  - `pnpm test -- --runTestsByPath "<path>"` for one file.
  - `pnpm typecheck`, `pnpm lint`.
  - `pnpm build` with `BETTER_AUTH_SECRET=throwaway-dev-secret-0123456789abcdef BETTER_AUTH_URL=http://localhost:3000` on the command line.
- **Docker:** if Postgres is down, start it per CLAUDE.md.
- **Size:** about 18 files, above the ~8-file guide. The spec set 5b-2 as one PR. It splits cleanly into backend (Tasks 1–4) and frontend (Tasks 5–7) commits for review.

## Review Focus

1. **`next=` open redirect.**
   - `//evil.example`, `/\evil.example`, `https://evil.example`, `javascript:alert(1)` and an encoded `%2F%2Fevil.example` must all fall back to `/`.
   - Test: Task 5.
2. **Two messages from the same side within 10 minutes.**
   - Exactly one email goes out, even when both `after()` callbacks run concurrently. The claim is a conditional `updateMany`, not a read-then-write.
   - Test: Task 3.
3. **A Resend failure.**
   - The throttle slot is released, so the next message retries.
   - The log line has the inquiry id and no email.
   - The response is unaffected.
   - Tests: Tasks 3 and 4.
4. **A space title or message containing `<script>`, quotes or CR/LF.**
   - It's HTML-escaped in the email body.
   - CR/LF never reach the subject.
   - Test: Task 2.
5. **Session expired between page load and submit (401).**
   - The form says so and links to sign in with `next` set back to this listing.
   - It never says "sent".
   - Test: Task 6.

---

## Part A — backend (`backend-dev`)

### Task 1: `isHostOfSpace`

**Files:**
- Modify: `app/_lib/server/inquiryAccess.ts`
- Test: `app/_lib/server/inquiryAccess.test.ts` (new)

**Interfaces:**
- **Produces:** `isHostOfSpace(spaceSlug: string, userId: string): Promise<boolean>`

- [ ] **Step 1: Write the failing test** `app/_lib/server/inquiryAccess.test.ts`

```ts
/** @jest-environment node */
const mockSpaceCount = jest.fn();
jest.mock("@/app/_lib/db", () => ({ prisma: { space: { count: (...a: unknown[]) => mockSpaceCount(...a) } } }));

import { isHostOfSpace } from "@/app/_lib/server/inquiryAccess";

beforeEach(() => jest.resetAllMocks());

it("is true when the space's host is linked to this user", async () => {
	mockSpaceCount.mockResolvedValue(1);
	await expect(isHostOfSpace("demo-poblacion-loft", "user_host")).resolves.toBe(true);
	expect(mockSpaceCount).toHaveBeenCalledWith({ where: { slug: "demo-poblacion-loft", host: { userId: "user_host" } } });
});

it("is false otherwise", async () => {
	mockSpaceCount.mockResolvedValue(0);
	await expect(isHostOfSpace("demo-poblacion-loft", "user_renter")).resolves.toBe(false);
});
```

- [ ] **Step 2:** Run it. Expected: FAIL, because `isHostOfSpace` is not exported.
- [ ] **Step 3: Append to `app/_lib/server/inquiryAccess.ts`**

```ts
// For the listing page: a host viewing their own space sees a note, not the form.
export async function isHostOfSpace(spaceSlug: string, userId: string): Promise<boolean> {
	return (await prisma.space.count({ where: { slug: spaceSlug, host: { userId } } })) > 0;
}
```

- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(inquiries): isHostOfSpace for the listing page`.

### Task 2: Email builder and date range

**Files:**
- Create: `app/_lib/server/escapeHtml.ts`, `app/_lib/server/inquiryEmail.ts`
- Modify: `app/_lib/server/magicLinkEmail.ts` (import the shared `escapeHtml`), `app/_lib/inquiryValidation.ts` (export `shootDateRange`)
- Test: `app/_lib/server/inquiryEmail.test.ts`, `app/_lib/inquiryValidation.test.ts` (add cases)

**Interfaces:**
- **Produces:**
  - `escapeHtml(value: string): string`
  - `inquiryMessageEmail(args: { to: string; spaceTitle: string; senderName: string; body: string; url: string; hostNotLinked: boolean }): MailMessage`
  - `shootDateRange(today: string): { min: string; max: string }`, used by the form's date input

- [ ] **Step 1: Write the failing test** `app/_lib/server/inquiryEmail.test.ts`

```ts
/** @jest-environment node */
import { inquiryMessageEmail } from "@/app/_lib/server/inquiryEmail";

const base = {
	to: "demo-host@example.invalid",
	spaceTitle: "[DEMO] Corner loft",
	senderName: "Demo Renter",
	body: "Free on the 20th?\nWe're 12 people.",
	url: "http://localhost:3000/inbox/inq_1",
	hostNotLinked: false,
};

it("addresses the recipient and names the space in the subject", () => {
	const msg = inquiryMessageEmail(base);
	expect(msg.to).toBe("demo-host@example.invalid");
	expect(msg.subject).toBe("New message about [DEMO] Corner loft");
});

it("includes sender name, message and reply link; says email replies aren't delivered", () => {
	const msg = inquiryMessageEmail(base);
	expect(msg.text).toContain("Demo Renter wrote about [DEMO] Corner loft:");
	expect(msg.text).toContain("Free on the 20th?\nWe're 12 people.");
	expect(msg.text).toContain("Reply on Iskawt: http://localhost:3000/inbox/inq_1");
	expect(msg.text).toContain("Replies to this email aren't delivered.");
	expect(msg.html).toContain('href="http://localhost:3000/inbox/inq_1"');
	expect(msg.html).toContain("Free on the 20th?<br>We&#39;re 12 people.");
});

it("tells an unlinked host to sign in with this address", () => {
	const msg = inquiryMessageEmail({ ...base, hostNotLinked: true, url: "http://localhost:3000/sign-in?next=%2Finbox%2Finq_1" });
	expect(msg.text).toContain("Sign in with this email address to read and reply: http://localhost:3000/sign-in?next=%2Finbox%2Finq_1");
});

it("escapes HTML in every interpolated value and strips CR/LF from the subject", () => {
	const msg = inquiryMessageEmail({
		...base,
		spaceTitle: 'Loft <b>"A"</b>\r\nBcc: x@example.invalid',
		senderName: "<img src=x onerror=alert(1)>",
		body: "<script>alert(1)</script>",
	});
	expect(msg.subject).toBe('New message about Loft <b>"A"</b> Bcc: x@example.invalid');
	expect(msg.subject).not.toMatch(/[\r\n]/);
	expect(msg.html).not.toContain("<script>");
	expect(msg.html).not.toContain("<img");
	expect(msg.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
	expect(msg.html).toContain("Loft &lt;b&gt;&quot;A&quot;&lt;/b&gt;");
});
```

  Append to `app/_lib/inquiryValidation.test.ts`:

```ts
import { shootDateRange } from "@/app/_lib/inquiryValidation";

describe("shootDateRange", () => {
	it("spans today to one year ahead, matching the validator", () => {
		expect(shootDateRange("2026-10-07")).toEqual({ min: "2026-10-07", max: "2027-10-07" });
		expect(shootDateRange("2028-02-29")).toEqual({ min: "2028-02-29", max: "2029-02-28" });
	});
});
```

  **Check the leap-year case first.** Adding 365 days to 2028-02-29 lands on 2029-02-28. Run that assertion before writing the expectation. If the existing private `addDays` returns something else, the test expectation follows the validator, not the other way round. Ledger the actual value.

- [ ] **Step 2:** Run both test files. Expected: FAIL, because the module and the export are missing.

- [ ] **Step 3: Implement.** `app/_lib/server/escapeHtml.ts`:

```ts
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
```

  In `magicLinkEmail.ts`, delete the local `escapeHtml` and import this one. The existing `magicLinkEmail.test.ts` must still pass.

  `app/_lib/server/inquiryEmail.ts`:

```ts
// The "new message" notification. Names, the space title and the message
// only: never anyone's email address or phone.

import { SITE_NAME } from "@/app/_lib/constants/site";
import { escapeHtml } from "@/app/_lib/server/escapeHtml";
import type { MailMessage } from "@/app/_lib/server/mailer";

type Args = {
	to: string;
	spaceTitle: string;
	senderName: string;
	body: string;
	url: string;
	hostNotLinked: boolean;
};

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ");

export function inquiryMessageEmail({ to, spaceTitle, senderName, body, url, hostNotLinked }: Args): MailMessage {
	const cta = hostNotLinked ? "Sign in with this email address to read and reply" : `Reply on ${SITE_NAME}`;
	const footer = `Replies to this email aren't delivered. Reply on ${SITE_NAME} instead.`;
	return {
		to,
		subject: `New message about ${oneLine(spaceTitle)}`,
		text: `${senderName} wrote about ${spaceTitle}:\n\n${body}\n\n${cta}: ${url}\n\n${footer}`,
		html:
			`<p>${escapeHtml(senderName)} wrote about ${escapeHtml(spaceTitle)}:</p>` +
			`<p>${escapeHtml(body).replace(/\r?\n/g, "<br>")}</p>` +
			`<p><a href="${escapeHtml(url)}">${escapeHtml(cta)}</a></p>` +
			`<p>${escapeHtml(footer)}</p>`,
	};
}
```

  In `app/_lib/inquiryValidation.ts`, export the range next to the private `addDays`:

```ts
// The shoot-date window the validator accepts, for the form's date input.
export function shootDateRange(today: string): { min: string; max: string } {
	return { min: today, max: addDays(today, SHOOT_DATE_MAX_DAYS_AHEAD) };
}
```

- [ ] **Step 4:** Run both test files, plus `app/_lib/server/magicLinkEmail.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(inquiries): new-message email and shared HTML escaping`.

### Task 3: `notifyCounterpart`

**Files:**
- Create: `app/_lib/server/inquiryNotify.ts`
- Test: `app/_lib/server/inquiryNotify.test.ts`

**Interfaces:**
- **Consumes:** `getMailer` (5a), `inquiryMessageEmail` (Task 2), `NOTIFY_COOLDOWN_MINUTES`.
- **Produces:** `notifyCounterpart(inquiryId: string, senderRole: InquiryRole, body: string, now?: Date): Promise<void>`, which never throws.

- [ ] **Step 1: Write the failing test** `app/_lib/server/inquiryNotify.test.ts`

```ts
/** @jest-environment node */
const mockFindUnique = jest.fn();
const mockUpdateMany = jest.fn();
const mockSend = jest.fn();

jest.mock("@/app/_lib/db", () => ({
	prisma: {
		inquiry: {
			findUnique: (...a: unknown[]) => mockFindUnique(...a),
			updateMany: (...a: unknown[]) => mockUpdateMany(...a),
		},
	},
}));
jest.mock("@/app/_lib/server/mailer", () => ({ getMailer: () => ({ send: (...a: unknown[]) => mockSend(...a) }) }));

import { notifyCounterpart } from "@/app/_lib/server/inquiryNotify";

const now = new Date("2026-10-07T10:00:00Z");
const cutoff = new Date("2026-10-07T09:50:00Z");
const row = (hostUser: { email: string } | null = { email: "demo-host@example.invalid" }) => ({
	id: "inq_1",
	requesterName: "Demo Renter",
	hostNotifiedAt: null,
	renterNotifiedAt: null,
	renter: { email: "demo-renter@example.invalid" },
	space: {
		title: "[DEMO] Corner loft",
		host: { displayName: "Demo Host A", contactEmail: "demo-host-contact@example.invalid", user: hostUser },
	},
});

let errorSpy: jest.SpyInstance;
beforeEach(() => {
	jest.resetAllMocks();
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	mockFindUnique.mockResolvedValue(row());
	mockUpdateMany.mockResolvedValue({ count: 1 });
	mockSend.mockResolvedValue(undefined);
	errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

it("emails the linked host when the renter writes, after claiming the host's throttle slot", async () => {
	await notifyCounterpart("inq_1", "RENTER", "Free on the 20th?", now);
	expect(mockUpdateMany).toHaveBeenCalledWith({
		where: { id: "inq_1", OR: [{ hostNotifiedAt: null }, { hostNotifiedAt: { lt: cutoff } }] },
		data: { hostNotifiedAt: now },
	});
	expect(mockSend).toHaveBeenCalledWith(
		expect.objectContaining({
			to: "demo-host@example.invalid",
			subject: "New message about [DEMO] Corner loft",
			text: expect.stringContaining("Demo Renter wrote about"),
		}),
	);
	expect(mockSend.mock.calls[0][0].text).toContain("http://localhost:3000/inbox/inq_1");
});

it("emails an unlinked host at contactEmail with sign-in wording", async () => {
	mockFindUnique.mockResolvedValue(row(null));
	await notifyCounterpart("inq_1", "RENTER", "Hi", now);
	const msg = mockSend.mock.calls[0][0];
	expect(msg.to).toBe("demo-host-contact@example.invalid");
	expect(msg.text).toContain("Sign in with this email address to read and reply: http://localhost:3000/sign-in?next=%2Finbox%2Finq_1");
});

it("emails the renter when the host writes, naming the host by displayName", async () => {
	await notifyCounterpart("inq_1", "HOST", "Yes", now);
	expect(mockUpdateMany.mock.calls[0][0].data).toEqual({ renterNotifiedAt: now });
	expect(mockSend.mock.calls[0][0]).toMatchObject({ to: "demo-renter@example.invalid", text: expect.stringContaining("Demo Host A wrote about") });
});

it("sends nothing when the throttle slot is already taken (count 0)", async () => {
	mockUpdateMany.mockResolvedValue({ count: 0 });
	await notifyCounterpart("inq_1", "RENTER", "Hi", now);
	expect(mockSend).not.toHaveBeenCalled();
});

it("on send failure releases the slot and logs only the inquiry id", async () => {
	mockSend.mockRejectedValue(new Error("Resend responded 503 for demo-host@example.invalid"));
	await expect(notifyCounterpart("inq_1", "RENTER", "secret message body", now)).resolves.toBeUndefined();
	expect(mockUpdateMany).toHaveBeenLastCalledWith({
		where: { id: "inq_1", hostNotifiedAt: now },
		data: { hostNotifiedAt: null },
	});
	expect(errorSpy).toHaveBeenCalledWith("[inquiry] notify failed", { inquiryId: "inq_1" });
	expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(/example\.invalid|secret message|Demo Renter/);
});

it("never throws, even when the database read fails", async () => {
	mockFindUnique.mockRejectedValue(new Error("db down"));
	await expect(notifyCounterpart("inq_1", "RENTER", "Hi", now)).resolves.toBeUndefined();
	expect(errorSpy).toHaveBeenCalledWith("[inquiry] notify failed", { inquiryId: "inq_1" });
});

it("does nothing for an unknown inquiry", async () => {
	mockFindUnique.mockResolvedValue(null);
	await notifyCounterpart("nope", "RENTER", "Hi", now);
	expect(mockUpdateMany).not.toHaveBeenCalled();
	expect(mockSend).not.toHaveBeenCalled();
});
```

- [ ] **Step 2:** Run it. Expected: FAIL, because the module can't be found.

- [ ] **Step 3: Implement `app/_lib/server/inquiryNotify.ts`**

```ts
// Emails the other side of a thread after a message is saved. Runs from
// after(), so it never delays or fails the request. The throttle slot is
// claimed with a conditional updateMany: two messages in a row can't both
// send. Contact addresses are read here only to address the email and are
// never logged or returned.

import { NOTIFY_COOLDOWN_MINUTES } from "@/app/_lib/constants/inquiries";
import { prisma } from "@/app/_lib/db";
import { inquiryMessageEmail } from "@/app/_lib/server/inquiryEmail";
import { getMailer } from "@/app/_lib/server/mailer";
import type { InquiryRole } from "@/app/_lib/types";

const fail = (inquiryId: string) => console.error("[inquiry] notify failed", { inquiryId });

async function claim(inquiryId: string, toHost: boolean, now: Date): Promise<boolean> {
	const cutoff = new Date(now.getTime() - NOTIFY_COOLDOWN_MINUTES * 60 * 1000);
	const { count } = toHost
		? await prisma.inquiry.updateMany({
				where: { id: inquiryId, OR: [{ hostNotifiedAt: null }, { hostNotifiedAt: { lt: cutoff } }] },
				data: { hostNotifiedAt: now },
			})
		: await prisma.inquiry.updateMany({
				where: { id: inquiryId, OR: [{ renterNotifiedAt: null }, { renterNotifiedAt: { lt: cutoff } }] },
				data: { renterNotifiedAt: now },
			});
	return count === 1;
}

// Release only the slot we took, so the next message retries.
async function release(inquiryId: string, toHost: boolean, now: Date): Promise<void> {
	if (toHost) {
		await prisma.inquiry.updateMany({ where: { id: inquiryId, hostNotifiedAt: now }, data: { hostNotifiedAt: null } });
	} else {
		await prisma.inquiry.updateMany({ where: { id: inquiryId, renterNotifiedAt: now }, data: { renterNotifiedAt: null } });
	}
}

export async function notifyCounterpart(
	inquiryId: string,
	senderRole: InquiryRole,
	body: string,
	now: Date = new Date(),
): Promise<void> {
	const toHost = senderRole === "RENTER";
	try {
		const row = await prisma.inquiry.findUnique({
			where: { id: inquiryId },
			select: {
				id: true,
				requesterName: true,
				renter: { select: { email: true } },
				space: {
					select: {
						title: true,
						host: { select: { displayName: true, contactEmail: true, user: { select: { email: true } } } },
					},
				},
			},
		});
		if (!row) return;
		if (!(await claim(inquiryId, toHost, now))) return;

		const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
		const threadPath = `/inbox/${inquiryId}`;
		const host = row.space.host;
		const hostNotLinked = toHost && host.user === null;
		const message = inquiryMessageEmail({
			to: toHost ? (host.user?.email ?? host.contactEmail) : row.renter.email,
			spaceTitle: row.space.title,
			senderName: toHost ? row.requesterName : host.displayName,
			body,
			url: hostNotLinked ? `${base}/sign-in?next=${encodeURIComponent(threadPath)}` : `${base}${threadPath}`,
			hostNotLinked,
		});

		try {
			await getMailer().send(message);
		} catch {
			await release(inquiryId, toHost, now);
			fail(inquiryId);
		}
	} catch {
		fail(inquiryId);
	}
}
```

  The test's first case selects no `*NotifiedAt` fields. The `row()` fixture has them, but the code doesn't read them, because the claim does the check. That's intended.

- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(inquiries): notify the other side, throttled per side per thread`.

### Task 4: Schedule notifications from the routes

**Files:**
- Modify: `app/api/inquiries/route.ts`, `app/api/inquiries/[id]/messages/route.ts`, `app/_lib/server/inquiryWrites.ts` (add `role` to the `sent` result), `app/_lib/server/inquiryWrites.test.ts`
- Test: `app/api/inquiries/routes.test.ts` (add cases)

**Interfaces:**
- **Consumes:** `notifyCounterpart` (Task 3), and `after` from `next/server`.
- **Produces:** `PostResult` `sent` becomes `{ kind: "sent"; message: InquiryMessage; role: InquiryRole }`.

- [ ] **Step 1: Write the failing tests.**

  In `inquiryWrites.test.ts`, change every expected `kind: "sent"` result to include `role`:
  - `role: "HOST"` in the host's first-reply test;
  - `role: "RENTER"` where the renter posts.

  In `routes.test.ts`, add these mocks at the top with the others:

```ts
const mockNotify = jest.fn();
const afterCallbacks: Array<() => unknown> = [];
jest.mock("@/app/_lib/server/inquiryNotify", () => ({ notifyCounterpart: (...a: unknown[]) => mockNotify(...a) }));
jest.mock("next/server", () => ({ after: (cb: () => unknown) => afterCallbacks.push(cb) }));
```

  Add `afterCallbacks.length = 0;` to `beforeEach`. Then add:

```ts
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
```

- [ ] **Step 2:** Run both test files. Expected: FAIL, because `role` is missing and `after` is never called.

- [ ] **Step 3: Implement.**
  - **`inquiryWrites.ts`:** add `role: InquiryRole` to the `sent` variant of `PostResult`, and return `{ kind: "sent", message: toInquiryMessage(row, userId, p), role: p.role }`. Import `InquiryRole` from `@/app/_lib/types`.
  - **`app/api/inquiries/route.ts`:** add `import { after } from "next/server";` and `import { notifyCounterpart } from "@/app/_lib/server/inquiryNotify";`. In the `created` and `reused` cases, before returning:

```ts
after(() => notifyCounterpart(outcome.id, "RENTER", result.value.message));
```

  - **`app/api/inquiries/[id]/messages/route.ts`:** add the same imports, and in the `sent` case:

```ts
after(() => notifyCounterpart(id, outcome.role, validated.value));
return Response.json({ message: outcome.message } satisfies PostMessageResponse, { status: 201 });
```

- [ ] **Step 4:** Run both test files, then the full `pnpm test`, `pnpm typecheck` and `pnpm lint`.
- [ ] **Step 5: Manual check** against local Docker with `pnpm dev`, throwaway `BETTER_AUTH_*` values and the console mailer:
  1. A renter creates an inquiry. Expected: one `[dev mail] New message about …` addressed to the host. Use an unlinked demo host, so it goes to `contactEmail` with the sign-in wording.
  2. A second renter message within 10 minutes. Expected: no new email.
  3. The host replies. Expected: one email to the renter.
  4. Clean up every row you created, restore any host you changed, and delete logs that contain magic-link tokens.
- [ ] **Step 6: Commit** with `feat(inquiries): email the other side after each message`.

---

## Part B — frontend (`frontend-dev`)

### Task 5: `/sign-in?next=`

**Files:**
- Create: `app/sign-in/safeNext.ts`, `app/sign-in/safeNext.test.ts`
- Modify: `app/sign-in/page.tsx`, `app/sign-in/page.test.tsx`, `app/_components/SignInForm.tsx`, `app/_components/SignInForm.test.tsx`

**Interfaces:**
- **Produces:**
  - `safeNext(raw: string | string[] | undefined): string`, which returns a same-site path or `"/"`;
  - `SignInForm` takes `next: string` and uses it as `callbackURL`.

- [ ] **Step 1: Write the failing tests.**

  `app/sign-in/safeNext.test.ts`:

```ts
import { safeNext } from "./safeNext";

it.each([
	["/spaces/demo-poblacion-loft", "/spaces/demo-poblacion-loft"],
	["/inbox/inq_1?x=1#m9", "/inbox/inq_1?x=1#m9"],
	[["/inbox", "/evil"], "/inbox"],
])("keeps the same-site path %p", (raw, expected) => {
	expect(safeNext(raw)).toBe(expected);
});

it.each([
	undefined,
	"",
	"inbox",
	"//evil.example",
	"/\\evil.example",
	"https://evil.example",
	"javascript:alert(1)",
	"%2F%2Fevil.example",
	"/%2F/evil.example",
	" /inbox",
	"/inbox\nSet-Cookie: x",
])("falls back to / for %p", (raw) => {
	expect(safeNext(raw)).toBe("/");
});
```

  In `page.test.tsx`, add:
  - signed in with `?next=/spaces/x` → `redirect("/spaces/x")`;
  - signed out with `?next=//evil.example` → `SignInForm` receives `next="/"`. Assert by mocking `SignInForm`, or by checking the `magicLink` call in the form test.

  In `SignInForm.test.tsx`, add a test that `<SignInForm linkError={false} next="/spaces/demo-poblacion-loft" />` calls `magicLink` with `callbackURL: "/spaces/demo-poblacion-loft"`, and update the existing renders to pass `next="/"`.

- [ ] **Step 2:** Run them. Expected: FAIL.

- [ ] **Step 3: Implement `app/sign-in/safeNext.ts`**

```ts
// Where to send someone after sign-in. Only a path on this site: anything that
// could leave it (//host, /\host, a scheme, an encoded slash, whitespace or
// control characters) falls back to "/".
export function safeNext(raw: string | string[] | undefined): string {
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (!value || !value.startsWith("/")) return "/";
	if (value.startsWith("//") || value.startsWith("/\\")) return "/";
	if (/[\s\\]|%2f|%5c/i.test(value)) return "/";
	return value;
}
```

  In `page.tsx`:
  - read `next` from `searchParams` alongside `error`;
  - compute `const next = safeNext(rawNext)`;
  - replace `redirect("/")` with `redirect(next)`;
  - render `<SignInForm linkError={…} next={next} />`.

  In `SignInForm.tsx`:
  - add `next: string` to the props;
  - pass `callbackURL: next`;
  - keep `errorCallbackURL: "/sign-in"`. A failed link lands on plain `/sign-in`, which is acceptable.

- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(auth-ui): return to the page you came from after sign-in`.

### Task 6: `InquiryForm`

**Files:**
- Create: `app/_components/InquiryForm.tsx`, `app/_components/InquiryForm.module.scss`, `app/_components/InquiryForm.test.tsx`

**Interfaces:**
- **Consumes:**
  - `validateNewInquiry` and `shootDateRange` (Task 2);
  - `productionTypeLabels`;
  - the API shapes `CreateInquiryResponse` and `InquiryApiError`.
- **Produces:** `InquiryForm({ spaceSlug, hostName, respondsInHours, today }: { spaceSlug: string; hostName: string; respondsInHours: number | null; today: string })`. `today` is computed on the server to avoid a hydration mismatch.

- [ ] **Step 1: Write the failing test** `app/_components/InquiryForm.test.tsx`

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InquiryForm from "@/app/_components/InquiryForm";
import { renderWithTheme } from "@/app/_components/testing";

const props = { spaceSlug: "demo-poblacion-loft", hostName: "Demo Host A", respondsInHours: 12, today: "2026-10-07" };
const mockFetch = jest.fn();
beforeEach(() => {
	mockFetch.mockReset();
	global.fetch = mockFetch;
});
const reply = (status: number, body: unknown) => mockFetch.mockResolvedValue(new Response(JSON.stringify(body), { status }));

async function fillRequired() {
	await userEvent.type(screen.getByLabelText("Your name"), "Demo Renter");
	await userEvent.type(screen.getByLabelText("Message"), "Free on the 20th?");
}
const submit = () => userEvent.click(screen.getByRole("button", { name: "Send inquiry" }));

it("labels every field and bounds the date input", () => {
	renderWithTheme(<InquiryForm {...props} />);
	for (const label of ["Your name", "Company (optional)", "Shoot date (optional)", "Hours needed (optional)", "Crew size (optional)", "Production type", "Budget note (optional)", "Message"]) {
		expect(screen.getByLabelText(label)).toBeInTheDocument();
	}
	expect(screen.getByLabelText("Shoot date (optional)")).toHaveAttribute("min", "2026-10-07");
	expect(screen.getByLabelText("Shoot date (optional)")).toHaveAttribute("max", "2027-10-07");
});

it("hides the spam trap from people and assistive tech", () => {
	const { container } = renderWithTheme(<InquiryForm {...props} />);
	const trap = container.querySelector('input[name="website"]');
	expect(trap).not.toBeNull();
	expect(trap).toHaveAttribute("tabindex", "-1");
	expect(trap).toHaveAttribute("autocomplete", "off");
	expect(trap?.closest('[aria-hidden="true"]')).not.toBeNull();
});

it("validates on the client with the shared rules and doesn't post", async () => {
	renderWithTheme(<InquiryForm {...props} />);
	await submit();
	expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
	expect(screen.getByText("Write a message.")).toBeInTheDocument();
	expect(mockFetch).not.toHaveBeenCalled();
});

it("posts the inquiry and shows the sent state with a link to the thread", async () => {
	reply(201, { id: "inq_new", reused: false });
	renderWithTheme(<InquiryForm {...props} />);
	await fillRequired();
	await submit();
	const status = await screen.findByRole("status");
	expect(status).toHaveTextContent("Sent. Demo Host A usually replies within 12 hours. We'll email you when they do.");
	expect(status).toHaveFocus();
	expect(within(status).getByRole("link", { name: "View conversation" })).toHaveAttribute("href", "/inbox/inq_new");
	const [url, init] = mockFetch.mock.calls[0];
	expect(url).toBe("/api/inquiries");
	expect(JSON.parse(init.body)).toMatchObject({ spaceSlug: "demo-poblacion-loft", requesterName: "Demo Renter", message: "Free on the 20th?", website: "" });
});

it("omits the reply-time sentence when the host hasn't set one", async () => {
	reply(201, { id: "inq_new", reused: false });
	renderWithTheme(<InquiryForm {...props} respondsInHours={null} />);
	await fillRequired();
	await submit();
	expect(await screen.findByRole("status")).toHaveTextContent("Sent. We'll email you when Demo Host A replies.");
});

it("explains a reused thread: details weren't updated", async () => {
	reply(200, { id: "inq_open", reused: true });
	renderWithTheme(<InquiryForm {...props} />);
	await fillRequired();
	await submit();
	expect(await screen.findByRole("status")).toHaveTextContent(
		"Added to your existing conversation. Dates, hours and crew size there weren't changed. Mention any changes in your message.",
	);
});

it("shows a sent state without a link for a null id", async () => {
	reply(201, { id: null, reused: false });
	renderWithTheme(<InquiryForm {...props} />);
	await fillRequired();
	await submit();
	const status = await screen.findByRole("status");
	expect(status).toHaveTextContent("Sent.");
	expect(within(status).queryByRole("link")).not.toBeInTheDocument();
});

it.each([
	[400, { error: "VALIDATION", fields: { shootDate: "Pick today or a later date." } }, "Pick today or a later date."],
	[400, { error: "OWN_SPACE" }, "You can't send an inquiry about your own listing."],
	[404, { error: "NOT_FOUND" }, "This listing isn't taking inquiries right now."],
	[429, { error: "RATE_LIMITED" }, "You've sent a lot of inquiries today. Try again tomorrow."],
	[500, {}, "We couldn't send that. Try again."],
])("shows the error for %i %o", async (status, body, text) => {
	reply(status, body);
	renderWithTheme(<InquiryForm {...props} />);
	await fillRequired();
	await submit();
	expect(await screen.findByText(text)).toBeInTheDocument();
	expect(screen.getByRole("status")).toBeEmptyDOMElement();
	expect(screen.getByRole("button", { name: "Send inquiry" })).toBeEnabled();
});

it("on 401 links back to sign-in with next set to this listing", async () => {
	reply(401, { error: "UNAUTHENTICATED" });
	renderWithTheme(<InquiryForm {...props} />);
	await fillRequired();
	await submit();
	const alert = await screen.findByRole("alert");
	expect(alert).toHaveTextContent("Your session ended. Sign in again to send this.");
	expect(within(alert).getByRole("link", { name: "Sign in again" })).toHaveAttribute(
		"href",
		"/sign-in?next=%2Fspaces%2Fdemo-poblacion-loft",
	);
});

it("handles a network failure and disables the button while sending", async () => {
	let reject: (e: Error) => void = () => {};
	mockFetch.mockReturnValue(new Promise((_, r) => (reject = r)));
	renderWithTheme(<InquiryForm {...props} />);
	await fillRequired();
	await submit();
	expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
	reject(new Error("offline"));
	expect(await screen.findByText("We couldn't send that. Try again.")).toBeInTheDocument();
});
```

- [ ] **Step 2:** Run it. Expected: FAIL, because the module can't be found.

- [ ] **Step 3: Implement `app/_components/InquiryForm.tsx`**

  Requirements:
  - **Client validation:**
    - Build `input` from the field state; numbers stay strings, and the validator parses them.
    - Call `validateNewInquiry(input, today)`.
    - If invalid, set the field errors and don't fetch.
  - **Submit:** `POST /api/inquiries` with JSON. Parse the response as `CreateInquiryResponse` on 200/201, or `InquiryApiError` otherwise.
  - **Status message:**
    - A persistent `<p role="status" tabIndex={-1}>` is rendered from first paint, empty until it shows a message, and gets focus on success (the same pattern as `SignInForm`).
    - When `id` is non-null, it contains a `next/link` "View conversation" link to `/inbox/<id>`.
  - **Copy:**
    - created, with `respondsInHours`: `Sent. <host> usually replies within <n> hour(s). We'll email you when they do.`
    - created, with `respondsInHours` null: `Sent. We'll email you when <host> replies.`
    - reused: `Added to your existing conversation. Dates, hours and crew size there weren't changed. Mention any changes in your message.`
    - null id: `Sent.`
  - **Errors:**
    - `VALIDATION` shows the field errors.
    - Every other error goes in an MUI `Alert` (which has `role="alert"`):
      - `OWN_SPACE`, `NOT_FOUND`, `RATE_LIMITED`, and anything else or a network error get the texts in the test.
      - `UNAUTHENTICATED` gets "Your session ended. Sign in again to send this." with a "Sign in again" link to `/sign-in?next=${encodeURIComponent("/spaces/" + spaceSlug)}`.
  - **Production type** is an MUI `TextField select`, labelled "Production type", defaulting to `FILM`, with options from `productionTypeLabels`.
  - **Shoot date** is `type="date"`, with `min` and `max` from `shootDateRange(today)` passed via `slotProps={{ htmlInput: { min, max } }}`.
  - **Spam trap:** wrap `<input name="website" tabIndex={-1} autoComplete="off">` in `<div aria-hidden="true" className={styles.trap}>`. Its label is "Leave this empty".
  - **Submit button:** "Send inquiry", which becomes "Sending…" and is disabled while sending.
  - **Labels** exactly as in the test.
  - **Styling:** SCSS module only. `.trap` is visually hidden off-screen: `position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden`. These are layout measures, not tokens. Use the tokens for the form's gap. The button's min-height is 44px.

- [ ] **Step 4:** Run it. Expected: PASS. Then run `pnpm typecheck && pnpm lint`.
- [ ] **Step 5: Commit** with `feat(inquiries-ui): inquiry form with shared validation`.

### Task 7: `InquiryPanel` on the listing page

**Files:**
- Create: `app/_components/InquiryPanel.tsx`, `app/_components/InquiryPanel.module.scss`, `app/_components/InquiryPanel.test.tsx`
- Modify: `app/spaces/[slug]/page.tsx`, `app/spaces/[slug]/page.test.tsx`

**Interfaces:**
- **Consumes:** `getCurrentUser` (5a), `isHostOfSpace` (Task 1), `manilaToday` (5b-1), `InquiryForm` (Task 6).
- **Produces:** `InquiryPanel({ viewer, slug, hostName, respondsInHours, today }: { viewer: "signed-out" | "host" | "renter"; slug: string; hostName: string; respondsInHours: number | null; today: string })`, a server component.

- [ ] **Step 1: Write the failing tests.**

  `app/_components/InquiryPanel.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import InquiryPanel from "@/app/_components/InquiryPanel";
import { renderWithTheme } from "@/app/_components/testing";

jest.mock("@/app/_components/InquiryForm", () => ({ __esModule: true, default: () => <form aria-label="Inquiry form" /> }));

const base = { slug: "demo-poblacion-loft", hostName: "Demo Host A", respondsInHours: 12, today: "2026-10-07" };

it("is a labelled section", () => {
	renderWithTheme(<InquiryPanel {...base} viewer="renter" />);
	expect(screen.getByRole("region", { name: "Send an inquiry" })).toBeInTheDocument();
});

it("signed out: links to sign-in and back to this listing", () => {
	renderWithTheme(<InquiryPanel {...base} viewer="signed-out" />);
	expect(screen.getByRole("link", { name: "Sign in to send an inquiry" })).toHaveAttribute(
		"href",
		"/sign-in?next=%2Fspaces%2Fdemo-poblacion-loft",
	);
	expect(screen.queryByRole("form", { name: "Inquiry form" })).not.toBeInTheDocument();
});

it("own listing: says so and links to the inbox", () => {
	renderWithTheme(<InquiryPanel {...base} viewer="host" />);
	expect(screen.getByText("This is your listing.")).toBeInTheDocument();
	expect(screen.getByRole("link", { name: "Go to your inbox" })).toHaveAttribute("href", "/inbox");
	expect(screen.queryByRole("form", { name: "Inquiry form" })).not.toBeInTheDocument();
});

it("renter: shows the form", () => {
	renderWithTheme(<InquiryPanel {...base} viewer="renter" />);
	expect(screen.getByRole("form", { name: "Inquiry form" })).toBeInTheDocument();
});
```

  In `app/spaces/[slug]/page.test.tsx`:
  - mock `@/app/_lib/server/currentUser` (`getCurrentUser`) and `@/app/_lib/server/inquiryAccess` (`isHostOfSpace`);
  - mock `@/app/_components/InquiryPanel` to render `<div data-testid="panel" data-viewer={viewer} />`;
  - set a default of signed out in `beforeEach`.

  Then add:
  - signed out → `viewer="signed-out"`, and `isHostOfSpace` is not called;
  - signed in, not the host → `"renter"`;
  - `isHostOfSpace` true → `"host"`;
  - `getCurrentUser` rejects → `"signed-out"`, and the page still renders.

- [ ] **Step 2:** Run them. Expected: FAIL.

- [ ] **Step 3: Implement.** `InquiryPanel.tsx` is a server component:
  - **Wrapper:** `<section aria-labelledby={headingId}>` with an `h2` "Send an inquiry".
  - **The three variants:**
    - signed out: a `next/link` to `/sign-in?next=${encodeURIComponent("/spaces/" + slug)}`, styled as a button, with a 44px target;
    - host: "This is your listing." and a link "Go to your inbox" to `/inbox`;
    - renter: `<InquiryForm spaceSlug={slug} hostName={hostName} respondsInHours={respondsInHours} today={today} />`.
  - **Styling:** SCSS module with tokens. The `/inbox` page arrives in 5b-3; until then the link 404s, and that's expected on this branch.

  In `app/spaces/[slug]/page.tsx`, after `notFound()`:

```tsx
const user = await getCurrentUser().catch(() => null);
const viewer = !user ? "signed-out" : (await isHostOfSpace(space.slug, user.id)) ? "host" : "renter";
```

  Then render, inside `.aside` and after `RatePanel`:

```tsx
<InquiryPanel
	viewer={viewer}
	slug={space.slug}
	hostName={space.host.displayName}
	respondsInHours={space.host.respondsInHours}
	today={manilaToday()}
/>
```

- [ ] **Step 4:** Run them. Expected: PASS. Then run the full suite, `pnpm typecheck`, `pnpm lint`, and `pnpm build` with the throwaway values.
- [ ] **Step 5: Manual check.** Run `pnpm dev` with throwaway secrets, then check:
  1. Signed out on a listing: the sign-in link round-trips back to the listing after the magic link.
  2. The form sends; the console mailer prints the host email; the success copy shows.
  3. Sending again shows the reused copy.
  4. The linked host sees "This is your listing.".
  5. `/sign-in?next=//evil.example` lands on `/` after sign-in.

  Clean up every row you created, restore any host you changed, and delete token logs.
- [ ] **Step 6: Commit** with `feat(inquiries-ui): inquiry panel on the listing page`.
- [ ] **Step 7: Checkpoint.** Stop. The main session sends it to `reviewer`.
