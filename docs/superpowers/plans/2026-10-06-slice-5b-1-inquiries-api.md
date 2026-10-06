# Slice 5b-1 — Inquiries Data and API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** This PR builds the server side of in-app inquiries: the reshaped `Inquiry` and a new `Message` table, one validation module shared with the future form, server reads and writes with participant-only access, and four route handlers. It has no UI and sends no email; those come in 5b-2 and 5b-3.

**Architecture:**
- **Routes stay thin:** session check, parse, validate, call one server function, map its result to a status code.
- **Server functions** in `app/_lib/server/` return discriminated results, never throw for expected outcomes, and use an explicit `select` on every query.
- **Participation** — who is renter, who is host, or neither — is decided in one place, `inquiryAccess.ts`. Everything else asks it.
- **Validation** is a pure module at `app/_lib/inquiryValidation.ts`, so the 5b-2 form can import it.

**Tech Stack:** Next.js 16.3.8 route handlers, Prisma 7.10 with the generated client at `@/generated/prisma`, Better Auth sessions via `getCurrentUser()` from 5a, and Jest 30 in the node environment with Prisma mocked.

**Spec:** `docs/superpowers/specs/2026-10-06-slice-5b-threads-design.md`. Read it together with `CLAUDE.md`, especially **Privacy rules**, **Workflow**, **Prisma 7** and **Definition of done**.

## Global Constraints

- **Ownership.**
  - Task 0 is done by the main session. It is the contract.
  - Tasks 1–5 go to `backend-dev`.
  - Nothing in this PR touches pages, components or SCSS.
- **Commits.**
  - Commit locally on `feat/slice-5b-threads` at each commit step, ending the message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. CLAUDE.md allows this.
  - If the agent judges the user's global rule forbids committing, it leaves the work uncommitted and lists the files per task. The main session commits.
  - Never push, never rebase.
- **The contract is fixed after Task 0.** Do not edit `app/_lib/types.ts`. If a shape is wrong, stop and report.
- **Files nobody edits by hand:** `prisma/migrations/**`, `generated/**`, lockfiles and `.env*`.
- **No new dependencies.**
- **Privacy.** No returned shape may contain:
  - `User.email`, `Host.contactEmail`, `Host.contactPhone` or `Space.exactAddress`;
  - `renterId`, `senderId` or a host's `userId`.
- **Explicit selects.** Every query uses an explicit `select`. `include` is a bug.
- **No sensitive logs.** No `console.*` line may print an email, a message body or a name.
- **Non-participants get 404.** They never get 403, and the response must not reveal whether the thread exists. A renter trying to decline gets 400 `NOT_HOST`, which reveals nothing new because they already know the thread.
- **TypeScript strict.** No `any`, no `@ts-ignore`, no non-null `!`.
- **Tests first.** Watch each new test fail before implementing.
- **Test style.** Server tests start with `/** @jest-environment node */` and mock `@/app/_lib/db` the way `app/_lib/server/spaces.test.ts` does. Route tests also mock `@/app/_lib/server/currentUser` and the server modules.
- **Commands.**
  - `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
  - To build, set `BETTER_AUTH_SECRET=throwaway-dev-secret-0123456789abcdef BETTER_AUTH_URL=http://localhost:3000` on the command line.
  - To run one test file: `pnpm test -- --runTestsByPath "<path>"`.
- **Docker.** If Postgres isn't up, start Docker per CLAUDE.md: `open -a Docker`, then `docker compose up -d`.

## Additions to the approved contract (main session, Task 0)

The spec gives the API responses as prose. Task 0 also adds them to `types.ts` as types, so that 5b-2 and 5b-3 build against named shapes:

- `CreateInquiryResponse = { id: string | null; reused: boolean }`
  - It is returned for both 201 (new thread) and 200 (reused).
  - A spam-trap hit returns 201 with `{ id: null, reused: false }`, a fake success.
  - The spec said `{ id }` for a new thread. The `reused: false` field is the only change.
- `InquiryApiError`, `MessagesResponse`, `PostMessageResponse` and `StatusResponse`.

## Review Focus

1. **Two inquiries submitted at the same moment** for the same space by the same renter.
   - Expected: one open thread at most.
   - The transaction runs at `Serializable` isolation. A losing transaction throws P2034, and the route returns 500 rather than creating a duplicate thread.
   - Tested in Task 4 by asserting the isolation level.
2. **`?after=` with an id from a different thread, or a made-up one.**
   - Expected: it is ignored, and all of this thread's messages are returned. Nothing from another thread leaks.
   - Tested in Task 3.
3. **A host whose space is later unpublished.**
   - Expected: existing threads stay readable and writable by both participants.
   - Only *new* inquiries require `PUBLISHED`. Participation doesn't check publish state.
   - Tested in Task 3.
4. **A malformed JSON body or a non-object body.**
   - Expected: 400 `VALIDATION`. Never a 500, and never a spam-trap false positive.
   - Tested in Task 5.
5. **A shoot date that is today in Manila but yesterday in UTC**, around 00:30 Manila time.
   - Expected: accepted.
   - Tested in Task 2.

---

## Part A — contract (main session)

### Task 0: Inquiry types and constants

**Files:**
- Modify: `app/_lib/types.ts` (re-export `InquiryStatus`; append the inquiry types)
- Create: `app/_lib/constants/inquiries.ts`

- [ ] **Step 1: Add `InquiryStatus`** to both the existing `export type { … } from "@/generated/prisma/enums"` list and the matching `import type` list at the top of `types.ts`.

- [ ] **Step 2: Append to `app/_lib/types.ts`**

```ts
// ---------------------------------------------------------------- inquiries
//
// An Inquiry is a conversation between one renter and the host of one space.
// Neither side ever sees the other's email or phone: names only.

// Which side of a thread the signed-in user is on.
export type InquiryRole = "RENTER" | "HOST";

// What the inquiry form posts. Dates are calendar dates in Manila, "YYYY-MM-DD".
export type NewInquiryInput = {
	spaceSlug: string;
	requesterName: string;
	requesterCompany: string | null;
	shootDate: string | null;
	durationHours: number | null;
	crewSize: number | null;
	productionType: ProductionType;
	budgetNote: string | null;
	message: string;
	website: string; // spam trap: hidden field, must be empty
};

export type InquiryMessage = {
	id: string;
	body: string;
	sentAt: string; // ISO 8601
	fromMe: boolean;
	senderName: string; // host displayName, or the inquiry's requesterName
};

// One row in /inbox.
export type InquirySummary = {
	id: string;
	role: InquiryRole;
	status: InquiryStatus;
	space: { slug: string; title: string };
	counterpartName: string;
	lastMessage: { body: string; sentAt: string; fromMe: boolean }; // body cut to INBOX_PREVIEW_CHARS
	unread: boolean;
};

// /inbox/[id]
export type InquiryThread = {
	id: string;
	role: InquiryRole;
	status: InquiryStatus;
	space: { slug: string; title: string; areaName: string; city: City };
	counterpartName: string;
	requesterCompany: string | null;
	shootDate: string | null; // "YYYY-MM-DD"
	durationHours: number | null;
	crewSize: number | null;
	productionType: ProductionType;
	budgetNote: string | null;
	messages: InquiryMessage[]; // oldest first
	canReply: boolean;
	canDecline: boolean;
	canClose: boolean;
};

// ---- API shapes (app/api/inquiries/**)

export type InquiryFieldErrors = Partial<Record<keyof NewInquiryInput, string>>;

export type InquiryApiError = {
	error: "UNAUTHENTICATED" | "VALIDATION" | "OWN_SPACE" | "NOT_FOUND" | "RATE_LIMITED" | "THREAD_CLOSED" | "NOT_HOST";
	fields?: InquiryFieldErrors;
};

// POST /api/inquiries — 201 new, 200 reused. id is null only for a spam-trap hit.
export type CreateInquiryResponse = { id: string | null; reused: boolean };

// POST /api/inquiries/[id]/messages — 201
export type PostMessageResponse = { message: InquiryMessage };

// GET /api/inquiries/[id]/messages?after=<messageId> — 200
export type MessagesResponse = { messages: InquiryMessage[]; status: InquiryStatus };

// POST /api/inquiries/[id]/status — 200
export type StatusResponse = { status: InquiryStatus };
```

- [ ] **Step 3: Create `app/_lib/constants/inquiries.ts`**

```ts
// Limits for inquiries and messages. Shared by the validator, the server and
// the forms. crewSize reuses CREW_MAX from limits.ts.

export const INQUIRY_NAME_MAX = 100;
export const INQUIRY_COMPANY_MAX = 100;
export const INQUIRY_BUDGET_NOTE_MAX = 500;
export const MESSAGE_BODY_MAX = 4000;
export const INQUIRY_DURATION_HOURS_MAX = 24;
export const SHOOT_DATE_MAX_DAYS_AHEAD = 365;
export const INQUIRIES_PER_USER_PER_DAY = 10;
export const MESSAGES_PER_USER_PER_HOUR = 60;
export const NOTIFY_COOLDOWN_MINUTES = 10;
export const THREAD_POLL_SECONDS = 15;
export const INBOX_PREVIEW_CHARS = 140;
```

- [ ] **Step 4:** Run `pnpm typecheck`. Expected: clean. The generated enum still contains `SENT` until Task 1 regenerates the client, which is harmless here.
- [ ] **Step 5: Commit** with the message `feat(contract): inquiry and message types, API shapes and limits`.

---

## Part B — backend (`backend-dev`)

### Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_inquiry_threads/` (via `pnpm db:migrate` only)

**Interfaces:**
- **Produces:**
  - Prisma models `Inquiry` (reshaped) and `Message`;
  - the enum `InquiryStatus { NEW RESPONDED DECLINED CLOSED }`;
  - the `User` back-relations `inquiries` and `messages`.

- [ ] **Step 1: Replace `model Inquiry`** in `prisma/schema.prisma`, keeping its section header comment, with:

```prisma
// An inquiry is the conversation between one renter (a User) and the host of
// one space. Neither side's email or phone is ever shown to the other: the
// renter is known by requesterName, the host by Host.displayName.
model Inquiry {
  id      String @id @default(cuid())
  spaceId String
  space   Space  @relation(fields: [spaceId], references: [id], onDelete: Cascade)

  renterId String
  renter   User   @relation(fields: [renterId], references: [id], onDelete: Cascade)

  // What the host sees about the renter. Typed on the form, because Better
  // Auth stores an empty User.name for magic-link sign-ups.
  requesterName    String
  requesterCompany String?

  shootDate      DateTime?      @db.Date
  durationHours  Int?
  crewSize       Int?
  productionType ProductionType @default(FILM)
  budgetNote     String?        @db.Text

  status InquiryStatus @default(NEW)

  lastMessageAt    DateTime  @default(now()) // inbox ordering and unread
  hostLastReadAt   DateTime?
  renterLastReadAt DateTime?
  hostNotifiedAt   DateTime? // email throttle, per side (5b-2)
  renterNotifiedAt DateTime?

  messages Message[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([spaceId, renterId, status])
  @@index([renterId, lastMessageAt])
  @@index([status, createdAt])
}

model Message {
  id        String   @id @default(cuid())
  inquiryId String
  inquiry   Inquiry  @relation(fields: [inquiryId], references: [id], onDelete: Cascade)
  senderId  String
  sender    User     @relation(fields: [senderId], references: [id], onDelete: Cascade)
  body      String   @db.Text // 1–4000 characters, trimmed
  createdAt DateTime @default(now())

  @@index([inquiryId, createdAt])
  @@index([senderId, createdAt])
}
```

- [ ] **Step 2:** Replace `enum InquiryStatus` with:

```prisma
enum InquiryStatus {
  NEW       // waiting for the host's first reply
  RESPONDED // the host has replied at least once
  DECLINED  // the host declined; read-only
  CLOSED    // either side closed it; read-only
}
```

  Then add these to `model User`, after `host Host?`:

```prisma
  inquiries Inquiry[] // as renter
  messages  Message[]
```

- [ ] **Step 3: Check the seed.** Run `grep -n "inquiry\|Inquiry" prisma/seed.ts`. Expected: only a comment. If the seed writes inquiries, stop and report.
- [ ] **Step 4: Migrate.** Run `pnpm db:migrate --name inquiry_threads`. Prisma 7 refuses non-interactive `migrate dev`, so run it under `script -q /dev/null` as in 5a, and answer `y` to the data-loss warnings about dropped columns and the enum value. The `Inquiry` table is empty. Then read the generated SQL and confirm it drops only the listed columns and the `SENT` value, and touches no other table except adding `Message` and the indexes.
- [ ] **Step 5: Check for drift.** Run `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`. Expected: exit 0.
- [ ] **Step 6: Run** `pnpm typecheck && pnpm test && pnpm db:seed`. Expected: all pass. The Task 0 enum errors are gone now that the client is regenerated.
- [ ] **Step 7: Commit** with the message `feat(inquiries): reshape Inquiry into a thread, add Message`.

### Task 2: Shared validation

**Files:**
- Create: `app/_lib/inquiryValidation.ts`
- Test: `app/_lib/inquiryValidation.test.ts`

**Interfaces:**
- **Produces:**
  - `manilaToday(now?: Date): string`
  - `validateNewInquiry(input: unknown, today: string): { ok: true; value: NewInquiryInput } | { ok: false; errors: InquiryFieldErrors }`
  - `validateMessageBody(body: unknown): { ok: true; value: string } | { ok: false; error: string }`
  - The module is pure: no server imports, safe for client components.

- [ ] **Step 1: Write the failing test** `app/_lib/inquiryValidation.test.ts`

```ts
import { manilaToday, validateMessageBody, validateNewInquiry } from "@/app/_lib/inquiryValidation";

const today = "2026-10-06";
const valid = {
	spaceSlug: "demo-poblacion-loft",
	requesterName: "  Demo Renter  ",
	requesterCompany: "",
	shootDate: "2026-10-20",
	durationHours: 6,
	crewSize: "12",
	productionType: "COMMERCIAL",
	budgetNote: null,
	message: "  Is the loft free on the 20th?  ",
	website: "",
};

describe("manilaToday", () => {
	it("uses Manila's calendar date, not UTC's", () => {
		// 2026-10-05T16:30Z is 00:30 on the 6th in Manila (UTC+8).
		expect(manilaToday(new Date("2026-10-05T16:30:00Z"))).toBe("2026-10-06");
	});
});

describe("validateNewInquiry", () => {
	it("accepts a valid input and normalizes it", () => {
		expect(validateNewInquiry(valid, today)).toEqual({
			ok: true,
			value: {
				spaceSlug: "demo-poblacion-loft",
				requesterName: "Demo Renter",
				requesterCompany: null,
				shootDate: "2026-10-20",
				durationHours: 6,
				crewSize: 12,
				productionType: "COMMERCIAL",
				budgetNote: null,
				message: "Is the loft free on the 20th?",
				website: "",
			},
		});
	});

	it("treats missing optional fields as null", () => {
		const result = validateNewInquiry(
			{ spaceSlug: "s", requesterName: "A", productionType: "FILM", message: "Hi", website: "" },
			today,
		);
		expect(result).toMatchObject({ ok: true, value: { shootDate: null, durationHours: null, crewSize: null } });
	});

	it.each([
		["requesterName", { requesterName: "   " }, "Enter your name."],
		["requesterName", { requesterName: "x".repeat(101) }, "Keep it under 100 characters."],
		["requesterCompany", { requesterCompany: "x".repeat(101) }, "Keep it under 100 characters."],
		["shootDate", { shootDate: "2026-02-30" }, "Enter a valid date."],
		["shootDate", { shootDate: "2026-10-05" }, "Pick today or a later date."],
		["shootDate", { shootDate: "2027-10-07" }, "Pick a date within the next year."],
		["durationHours", { durationHours: 0 }, "Enter whole hours from 1 to 24."],
		["durationHours", { durationHours: 2.5 }, "Enter whole hours from 1 to 24."],
		["crewSize", { crewSize: 1000 }, "Enter a crew size from 1 to 999."],
		["productionType", { productionType: "WEDDING" }, "Choose a production type."],
		["budgetNote", { budgetNote: "x".repeat(501) }, "Keep it under 500 characters."],
		["message", { message: "  " }, "Write a message."],
		["message", { message: "x".repeat(4001) }, "Keep it under 4000 characters."],
		["spaceSlug", { spaceSlug: "" }, "Missing space."],
	])("rejects a bad %s", (field, patch, error) => {
		const result = validateNewInquiry({ ...valid, ...patch }, today);
		expect(result).toEqual({ ok: false, errors: { [field]: error } });
	});

	it("accepts today and exactly one year ahead", () => {
		expect(validateNewInquiry({ ...valid, shootDate: "2026-10-06" }, today).ok).toBe(true);
		expect(validateNewInquiry({ ...valid, shootDate: "2027-10-06" }, today).ok).toBe(true);
	});

	it("counts characters, not UTF-16 units, for caps", () => {
		expect(validateNewInquiry({ ...valid, requesterName: "🎬".repeat(100) }, today).ok).toBe(true);
	});

	it("rejects a non-object body without throwing", () => {
		expect(validateNewInquiry(null, today)).toMatchObject({ ok: false });
		expect(validateNewInquiry("text", today)).toMatchObject({ ok: false });
	});

	it("keeps the spam-trap value as given, trimmed", () => {
		expect(validateNewInquiry({ ...valid, website: " http://x " }, today)).toMatchObject({
			ok: true,
			value: { website: "http://x" },
		});
	});
});

describe("validateMessageBody", () => {
	it("trims and accepts", () => {
		expect(validateMessageBody("  hello ")).toEqual({ ok: true, value: "hello" });
	});
	it("rejects empty, too long and non-strings", () => {
		expect(validateMessageBody(" ")).toEqual({ ok: false, error: "Write a message." });
		expect(validateMessageBody("x".repeat(4001))).toEqual({ ok: false, error: "Keep it under 4000 characters." });
		expect(validateMessageBody(42)).toEqual({ ok: false, error: "Write a message." });
	});
});
```

- [ ] **Step 2:** Run the test. Expected: FAIL, because the module can't be found.

- [ ] **Step 3: Implement `app/_lib/inquiryValidation.ts`**

```ts
// Validation for inquiries and messages. Pure, with no server imports, so the
// route handlers and the inquiry form share exactly the same rules.

import { CREW_MAX } from "@/app/_lib/constants/limits";
import {
	INQUIRY_BUDGET_NOTE_MAX,
	INQUIRY_COMPANY_MAX,
	INQUIRY_DURATION_HOURS_MAX,
	INQUIRY_NAME_MAX,
	MESSAGE_BODY_MAX,
	SHOOT_DATE_MAX_DAYS_AHEAD,
} from "@/app/_lib/constants/inquiries";
import { ProductionType } from "@/generated/prisma/enums";
import type { InquiryFieldErrors, NewInquiryInput } from "@/app/_lib/types";

const PRODUCTION_TYPES: readonly string[] = Object.values(ProductionType);

// Today's calendar date in Manila, "YYYY-MM-DD".
export function manilaToday(now: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}

function addDays(date: string, days: number): string {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function isRealDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [y, m, d] = value.split("-").map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const chars = (value: string) => [...value].length; // code points, not UTF-16 units
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const optionalText = (value: unknown) => text(value) || null;
const tooLong = (max: number) => `Keep it under ${max} characters.`;

function optionalInt(value: unknown): number | null | "invalid" {
	if (value === null || value === undefined || value === "") return null;
	const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
	return Number.isInteger(n) ? n : "invalid";
}

export function validateMessageBody(body: unknown): { ok: true; value: string } | { ok: false; error: string } {
	const value = text(body);
	if (!value) return { ok: false, error: "Write a message." };
	if (chars(value) > MESSAGE_BODY_MAX) return { ok: false, error: tooLong(MESSAGE_BODY_MAX) };
	return { ok: true, value };
}

export function validateNewInquiry(
	input: unknown,
	today: string,
): { ok: true; value: NewInquiryInput } | { ok: false; errors: InquiryFieldErrors } {
	const raw: Record<string, unknown> = typeof input === "object" && input !== null ? { ...input } : {};
	const errors: InquiryFieldErrors = {};

	const spaceSlug = text(raw.spaceSlug);
	if (!spaceSlug) errors.spaceSlug = "Missing space.";

	const requesterName = text(raw.requesterName);
	if (!requesterName) errors.requesterName = "Enter your name.";
	else if (chars(requesterName) > INQUIRY_NAME_MAX) errors.requesterName = tooLong(INQUIRY_NAME_MAX);

	const requesterCompany = optionalText(raw.requesterCompany);
	if (requesterCompany && chars(requesterCompany) > INQUIRY_COMPANY_MAX) errors.requesterCompany = tooLong(INQUIRY_COMPANY_MAX);

	const shootDate = optionalText(raw.shootDate);
	if (shootDate !== null) {
		if (!isRealDate(shootDate)) errors.shootDate = "Enter a valid date.";
		else if (shootDate < today) errors.shootDate = "Pick today or a later date.";
		else if (shootDate > addDays(today, SHOOT_DATE_MAX_DAYS_AHEAD)) errors.shootDate = "Pick a date within the next year.";
	}

	const durationHours = optionalInt(raw.durationHours);
	if (durationHours === "invalid" || (durationHours !== null && (durationHours < 1 || durationHours > INQUIRY_DURATION_HOURS_MAX))) {
		errors.durationHours = `Enter whole hours from 1 to ${INQUIRY_DURATION_HOURS_MAX}.`;
	}

	const crewSize = optionalInt(raw.crewSize);
	if (crewSize === "invalid" || (crewSize !== null && (crewSize < 1 || crewSize > CREW_MAX))) {
		errors.crewSize = `Enter a crew size from 1 to ${CREW_MAX}.`;
	}

	const productionType = text(raw.productionType);
	if (!PRODUCTION_TYPES.includes(productionType)) errors.productionType = "Choose a production type.";

	const budgetNote = optionalText(raw.budgetNote);
	if (budgetNote && chars(budgetNote) > INQUIRY_BUDGET_NOTE_MAX) errors.budgetNote = tooLong(INQUIRY_BUDGET_NOTE_MAX);

	const message = validateMessageBody(raw.message);
	if (!message.ok) errors.message = message.error;

	if (Object.keys(errors).length > 0 || !message.ok || durationHours === "invalid" || crewSize === "invalid") {
		return { ok: false, errors };
	}
	return {
		ok: true,
		value: {
			spaceSlug,
			requesterName,
			requesterCompany,
			shootDate,
			durationHours,
			crewSize,
			productionType: productionType as ProductionType,
			budgetNote,
			message: message.value,
			website: text(raw.website),
		},
	};
}
```

  **The `productionType` cast.** `as ProductionType` is a narrowing the `includes` check has already proven. If lint or review objects, replace it with a type-guard function such as `isProductionType(value: string): value is ProductionType`. Don't use `any`.

- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(inquiries): shared validation for inquiries and messages`.

### Task 3: Access and reads

**Files:**
- Create: `app/_lib/server/inquiryAccess.ts`, `app/_lib/server/inquiries.ts`
- Test: `app/_lib/server/inquiries.test.ts`

**Interfaces:**
- **Produces, from `inquiryAccess.ts`:**
  - `type Participation = { id: string; status: InquiryStatus; role: InquiryRole; renterId: string; requesterName: string; hostDisplayName: string }`
  - `getParticipation(inquiryId: string, userId: string): Promise<Participation | null>`
  - `isOpen(status: InquiryStatus): boolean`
  - `messageSelect`
  - `toInquiryMessage(row: { id: string; body: string; createdAt: Date; senderId: string }, viewerId: string, p: Pick<Participation, "renterId" | "requesterName" | "hostDisplayName">): InquiryMessage`
  - `markRead(inquiryId: string, role: InquiryRole, now: Date): Promise<void>`
- **Produces, from `inquiries.ts`:**
  - `listInquiriesForUser(userId: string): Promise<InquirySummary[]>`
  - `getInquiryThread(inquiryId: string, userId: string, now?: Date): Promise<InquiryThread | null>`
  - `getMessagesAfter(inquiryId: string, userId: string, after: string | null, now?: Date): Promise<MessagesResponse | null>`

- [ ] **Step 1: Write the failing test** `app/_lib/server/inquiries.test.ts`

```ts
/** @jest-environment node */
const mockInquiryFindUnique = jest.fn();
const mockInquiryFindMany = jest.fn();
const mockInquiryUpdate = jest.fn();
const mockMessageFindFirst = jest.fn();
const mockMessageFindMany = jest.fn();

jest.mock("@/app/_lib/db", () => ({
	prisma: {
		inquiry: {
			findUnique: (...a: unknown[]) => mockInquiryFindUnique(...a),
			findMany: (...a: unknown[]) => mockInquiryFindMany(...a),
			update: (...a: unknown[]) => mockInquiryUpdate(...a),
		},
		message: {
			findFirst: (...a: unknown[]) => mockMessageFindFirst(...a),
			findMany: (...a: unknown[]) => mockMessageFindMany(...a),
		},
	},
}));

import { getInquiryThread, getMessagesAfter, listInquiriesForUser } from "@/app/_lib/server/inquiries";

const now = new Date("2026-10-06T10:00:00Z");
const RENTER = "user_renter";
const HOST = "user_host";

// DEMO rows shaped like the participation select.
const participationRow = {
	id: "inq_1",
	status: "NEW",
	renterId: RENTER,
	requesterName: "Demo Renter",
	space: { host: { userId: HOST, displayName: "Demo Host A" } },
};
const msg = (id: string, senderId: string, at: string, body = "Hello") => ({
	id,
	body,
	senderId,
	createdAt: new Date(at),
});

const PRIVATE_KEYS = /email|contactEmail|contactPhone|exactAddress|renterId|senderId|userId/;

beforeEach(() => jest.resetAllMocks());

describe("participation", () => {
	it("returns null for a user who is neither renter nor host (no leak of existence)", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		await expect(getInquiryThread("inq_1", "user_stranger", now)).resolves.toBeNull();
		await expect(getMessagesAfter("inq_1", "user_stranger", null, now)).resolves.toBeNull();
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("returns null for an unknown inquiry", async () => {
		mockInquiryFindUnique.mockResolvedValue(null);
		await expect(getInquiryThread("nope", RENTER, now)).resolves.toBeNull();
	});

	it("never filters participation by publish state (unpublished spaces keep their threads)", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		mockMessageFindMany.mockResolvedValue([]);
		await getMessagesAfter("inq_1", RENTER, null, now);
		const where = mockInquiryFindUnique.mock.calls[0][0].where;
		expect(where).toEqual({ id: "inq_1" });
	});
});

describe("getInquiryThread", () => {
	const threadRow = {
		id: "inq_1",
		status: "RESPONDED",
		requesterCompany: "Demo Films",
		shootDate: new Date("2026-10-20T00:00:00Z"),
		durationHours: 6,
		crewSize: 12,
		productionType: "COMMERCIAL",
		budgetNote: null,
		space: { slug: "demo-poblacion-loft", title: "[DEMO] Corner loft", areaName: "Poblacion", city: "MAKATI" },
		messages: [msg("m1", RENTER, "2026-10-06T08:00:00Z", "Free on the 20th?"), msg("m2", HOST, "2026-10-06T09:00:00Z", "Yes")],
	};

	it("maps the thread for the host: renter shown by requesterName, host can decline", async () => {
		mockInquiryFindUnique.mockResolvedValueOnce({ ...participationRow, status: "RESPONDED" }).mockResolvedValueOnce(threadRow);
		const thread = await getInquiryThread("inq_1", HOST, now);
		expect(thread).toEqual({
			id: "inq_1",
			role: "HOST",
			status: "RESPONDED",
			space: { slug: "demo-poblacion-loft", title: "[DEMO] Corner loft", areaName: "Poblacion", city: "MAKATI" },
			counterpartName: "Demo Renter",
			requesterCompany: "Demo Films",
			shootDate: "2026-10-20",
			durationHours: 6,
			crewSize: 12,
			productionType: "COMMERCIAL",
			budgetNote: null,
			messages: [
				{ id: "m1", body: "Free on the 20th?", sentAt: "2026-10-06T08:00:00.000Z", fromMe: false, senderName: "Demo Renter" },
				{ id: "m2", body: "Yes", sentAt: "2026-10-06T09:00:00.000Z", fromMe: true, senderName: "Demo Host A" },
			],
			canReply: true,
			canDecline: true,
			canClose: true,
		});
		expect(mockInquiryUpdate).toHaveBeenCalledWith({
			where: { id: "inq_1" },
			data: { hostLastReadAt: now },
			select: { id: true },
		});
	});

	it("for the renter: counterpart is the host's displayName, no decline, marks renter read", async () => {
		mockInquiryFindUnique.mockResolvedValueOnce({ ...participationRow, status: "RESPONDED" }).mockResolvedValueOnce(threadRow);
		const thread = await getInquiryThread("inq_1", RENTER, now);
		expect(thread).toMatchObject({ role: "RENTER", counterpartName: "Demo Host A", canDecline: false, canReply: true });
		expect(mockInquiryUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { renterLastReadAt: now } }));
	});

	it("a closed thread can't be replied to, declined or closed", async () => {
		mockInquiryFindUnique
			.mockResolvedValueOnce({ ...participationRow, status: "CLOSED" })
			.mockResolvedValueOnce({ ...threadRow, status: "CLOSED" });
		await expect(getInquiryThread("inq_1", HOST, now)).resolves.toMatchObject({
			canReply: false,
			canDecline: false,
			canClose: false,
		});
	});

	it("never selects or returns private fields", async () => {
		mockInquiryFindUnique.mockResolvedValueOnce(participationRow).mockResolvedValueOnce(threadRow);
		const thread = await getInquiryThread("inq_1", HOST, now);
		expect(Object.keys(thread ?? {}).join(" ")).not.toMatch(PRIVATE_KEYS);
		for (const m of thread?.messages ?? []) expect(Object.keys(m).join(" ")).not.toMatch(PRIVATE_KEYS);
		for (const [args] of mockInquiryFindUnique.mock.calls) {
			expect(JSON.stringify(args.select)).not.toMatch(/email|contact|exactAddress|"host":true/);
		}
	});
});

describe("getMessagesAfter", () => {
	it("returns every message when `after` is absent, and marks read", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		mockMessageFindMany.mockResolvedValue([msg("m1", RENTER, "2026-10-06T08:00:00Z")]);
		const result = await getMessagesAfter("inq_1", RENTER, null, now);
		expect(result).toEqual({
			status: "NEW",
			messages: [{ id: "m1", body: "Hello", sentAt: "2026-10-06T08:00:00.000Z", fromMe: true, senderName: "Demo Renter" }],
		});
		expect(mockMessageFindMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { inquiryId: "inq_1" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
		);
	});

	it("returns only newer messages when `after` belongs to this thread", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		mockMessageFindFirst.mockResolvedValue({ id: "m1", createdAt: new Date("2026-10-06T08:00:00Z") });
		mockMessageFindMany.mockResolvedValue([]);
		await getMessagesAfter("inq_1", RENTER, "m1", now);
		expect(mockMessageFindFirst).toHaveBeenCalledWith({
			where: { id: "m1", inquiryId: "inq_1" },
			select: { id: true, createdAt: true },
		});
		expect(mockMessageFindMany.mock.calls[0][0].where).toEqual({
			inquiryId: "inq_1",
			OR: [
				{ createdAt: { gt: new Date("2026-10-06T08:00:00Z") } },
				{ createdAt: new Date("2026-10-06T08:00:00Z"), id: { gt: "m1" } },
			],
		});
	});

	it("ignores an `after` id from another thread (cursor lookup is scoped to this inquiry)", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow);
		mockMessageFindFirst.mockResolvedValue(null);
		mockMessageFindMany.mockResolvedValue([]);
		await getMessagesAfter("inq_1", RENTER, "m_other_thread", now);
		expect(mockMessageFindMany.mock.calls[0][0].where).toEqual({ inquiryId: "inq_1" });
	});
});

describe("listInquiriesForUser", () => {
	const row = (over: Record<string, unknown>) => ({
		id: "inq_1",
		status: "NEW",
		renterId: RENTER,
		requesterName: "Demo Renter",
		lastMessageAt: new Date("2026-10-06T09:00:00Z"),
		hostLastReadAt: null,
		renterLastReadAt: new Date("2026-10-06T08:00:00Z"),
		space: { slug: "demo-poblacion-loft", title: "[DEMO] Corner loft", host: { userId: HOST, displayName: "Demo Host A" } },
		messages: [msg("m2", HOST, "2026-10-06T09:00:00Z", "x".repeat(200))],
		...over,
	});

	it("queries threads where the user is renter or linked host, newest first", async () => {
		mockInquiryFindMany.mockResolvedValue([]);
		await listInquiriesForUser(RENTER);
		const args = mockInquiryFindMany.mock.calls[0][0];
		expect(args.where).toEqual({ OR: [{ renterId: RENTER }, { space: { host: { userId: RENTER } } }] });
		expect(args.orderBy).toEqual([{ lastMessageAt: "desc" }, { id: "asc" }]);
	});

	it("maps a row for the renter: unread when the host wrote after the renter last read; preview truncated", async () => {
		mockInquiryFindMany.mockResolvedValue([row({})]);
		const [summary] = await listInquiriesForUser(RENTER);
		expect(summary).toEqual({
			id: "inq_1",
			role: "RENTER",
			status: "NEW",
			space: { slug: "demo-poblacion-loft", title: "[DEMO] Corner loft" },
			counterpartName: "Demo Host A",
			lastMessage: { body: `${"x".repeat(140)}…`, sentAt: "2026-10-06T09:00:00.000Z", fromMe: false },
			unread: true,
		});
	});

	it("is not unread when the latest message is your own", async () => {
		mockInquiryFindMany.mockResolvedValue([row({ messages: [msg("m3", RENTER, "2026-10-06T09:00:00Z")] })]);
		const [summary] = await listInquiriesForUser(RENTER);
		expect(summary.unread).toBe(false);
	});

	it("for the host: counterpart is requesterName, unread when never read", async () => {
		mockInquiryFindMany.mockResolvedValue([row({ messages: [msg("m1", RENTER, "2026-10-06T09:00:00Z")] })]);
		const [summary] = await listInquiriesForUser(HOST);
		expect(summary).toMatchObject({ role: "HOST", counterpartName: "Demo Renter", unread: true });
	});

	it("never returns private keys", async () => {
		mockInquiryFindMany.mockResolvedValue([row({})]);
		const [summary] = await listInquiriesForUser(RENTER);
		expect(JSON.stringify(Object.keys(summary)) + JSON.stringify(Object.keys(summary.lastMessage))).not.toMatch(PRIVATE_KEYS);
	});
});
```

- [ ] **Step 2:** Run the test. Expected: FAIL, because the modules can't be found.

- [ ] **Step 3: Implement `app/_lib/server/inquiryAccess.ts`**

```ts
// Who is on which side of an inquiry. Every read and write asks here first.
// A user who is neither the renter nor the host's linked user gets null, and
// callers turn that into 404, so the existence of a thread is never revealed.
// Participation deliberately ignores the space's publish state: an unpublished
// listing keeps its conversations.

import { prisma } from "@/app/_lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { InquiryMessage, InquiryRole, InquiryStatus } from "@/app/_lib/types";

export type Participation = {
	id: string;
	status: InquiryStatus;
	role: InquiryRole;
	renterId: string;
	requesterName: string;
	hostDisplayName: string;
};

const participationSelect = {
	id: true,
	status: true,
	renterId: true,
	requesterName: true,
	space: { select: { host: { select: { userId: true, displayName: true } } } },
} satisfies Prisma.InquirySelect;

export const messageSelect = { id: true, body: true, createdAt: true, senderId: true } satisfies Prisma.MessageSelect;

export async function getParticipation(inquiryId: string, userId: string): Promise<Participation | null> {
	const row = await prisma.inquiry.findUnique({ where: { id: inquiryId }, select: participationSelect });
	if (!row) return null;
	const role: InquiryRole | null =
		row.renterId === userId ? "RENTER" : row.space.host.userId === userId ? "HOST" : null;
	if (!role) return null;
	return {
		id: row.id,
		status: row.status,
		role,
		renterId: row.renterId,
		requesterName: row.requesterName,
		hostDisplayName: row.space.host.displayName,
	};
}

export function isOpen(status: InquiryStatus): boolean {
	return status === "NEW" || status === "RESPONDED";
}

export function toInquiryMessage(
	row: { id: string; body: string; createdAt: Date; senderId: string },
	viewerId: string,
	p: Pick<Participation, "renterId" | "requesterName" | "hostDisplayName">,
): InquiryMessage {
	return {
		id: row.id,
		body: row.body,
		sentAt: row.createdAt.toISOString(),
		fromMe: row.senderId === viewerId,
		senderName: row.senderId === p.renterId ? p.requesterName : p.hostDisplayName,
	};
}

export async function markRead(inquiryId: string, role: InquiryRole, now: Date): Promise<void> {
	await prisma.inquiry.update({
		where: { id: inquiryId },
		data: role === "HOST" ? { hostLastReadAt: now } : { renterLastReadAt: now },
		select: { id: true },
	});
}
```

- [ ] **Step 4: Implement `app/_lib/server/inquiries.ts`**

```ts
// Reads for /inbox, /inbox/[id] and the thread poller. Participants only.

import { INBOX_PREVIEW_CHARS } from "@/app/_lib/constants/inquiries";
import { prisma } from "@/app/_lib/db";
import { getParticipation, isOpen, markRead, messageSelect, toInquiryMessage } from "@/app/_lib/server/inquiryAccess";
import type { InquirySummary, InquiryThread, MessagesResponse } from "@/app/_lib/types";

function preview(body: string): string {
	const chars = [...body];
	return chars.length > INBOX_PREVIEW_CHARS ? `${chars.slice(0, INBOX_PREVIEW_CHARS).join("")}…` : body;
}

export async function listInquiriesForUser(userId: string): Promise<InquirySummary[]> {
	const rows = await prisma.inquiry.findMany({
		where: { OR: [{ renterId: userId }, { space: { host: { userId } } }] },
		orderBy: [{ lastMessageAt: "desc" }, { id: "asc" }],
		select: {
			id: true,
			status: true,
			renterId: true,
			requesterName: true,
			lastMessageAt: true,
			hostLastReadAt: true,
			renterLastReadAt: true,
			space: { select: { slug: true, title: true, host: { select: { userId: true, displayName: true } } } },
			messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: messageSelect },
		},
	});

	return rows.flatMap((row) => {
		const last = row.messages[0];
		if (!last) return []; // every inquiry is created with a message; defensive
		const role = row.renterId === userId ? "RENTER" : "HOST";
		const lastRead = role === "HOST" ? row.hostLastReadAt : row.renterLastReadAt;
		const fromMe = last.senderId === userId;
		return [
			{
				id: row.id,
				role,
				status: row.status,
				space: { slug: row.space.slug, title: row.space.title },
				counterpartName: role === "RENTER" ? row.space.host.displayName : row.requesterName,
				lastMessage: { body: preview(last.body), sentAt: last.createdAt.toISOString(), fromMe },
				unread: !fromMe && (lastRead === null || row.lastMessageAt > lastRead),
			},
		];
	});
}

export async function getInquiryThread(
	inquiryId: string,
	userId: string,
	now: Date = new Date(),
): Promise<InquiryThread | null> {
	const p = await getParticipation(inquiryId, userId);
	if (!p) return null;

	const row = await prisma.inquiry.findUnique({
		where: { id: inquiryId },
		select: {
			id: true,
			status: true,
			requesterCompany: true,
			shootDate: true,
			durationHours: true,
			crewSize: true,
			productionType: true,
			budgetNote: true,
			space: { select: { slug: true, title: true, areaName: true, city: true } },
			messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: messageSelect },
		},
	});
	if (!row) return null;

	await markRead(inquiryId, p.role, now);
	const open = isOpen(row.status);
	return {
		id: row.id,
		role: p.role,
		status: row.status,
		space: row.space,
		counterpartName: p.role === "RENTER" ? p.hostDisplayName : p.requesterName,
		requesterCompany: row.requesterCompany,
		shootDate: row.shootDate ? row.shootDate.toISOString().slice(0, 10) : null,
		durationHours: row.durationHours,
		crewSize: row.crewSize,
		productionType: row.productionType,
		budgetNote: row.budgetNote,
		messages: row.messages.map((m) => toInquiryMessage(m, userId, p)),
		canReply: open,
		canDecline: open && p.role === "HOST",
		canClose: open,
	};
}

export async function getMessagesAfter(
	inquiryId: string,
	userId: string,
	after: string | null,
	now: Date = new Date(),
): Promise<MessagesResponse | null> {
	const p = await getParticipation(inquiryId, userId);
	if (!p) return null;

	// The cursor is looked up inside this inquiry only, so an id from another
	// thread is ignored rather than used.
	const cursor = after
		? await prisma.message.findFirst({ where: { id: after, inquiryId }, select: { id: true, createdAt: true } })
		: null;

	const rows = await prisma.message.findMany({
		where: cursor
			? {
					inquiryId,
					OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }],
				}
			: { inquiryId },
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		select: messageSelect,
	});

	await markRead(inquiryId, p.role, now);
	return { status: p.status, messages: rows.map((m) => toInquiryMessage(m, userId, p)) };
}
```

- [ ] **Step 5:** Run the test. Expected: PASS. Then run `pnpm typecheck && pnpm lint`.
- [ ] **Step 6: Commit** with the message `feat(inquiries): participant-only reads for inbox, thread and poller`.

### Task 4: Writes — create, message, status

**Files:**
- Create: `app/_lib/server/inquiryWrites.ts`
- Test: `app/_lib/server/inquiryWrites.test.ts`

**Interfaces:**
- **Consumes:** `getParticipation`, `isOpen`, `messageSelect` and `toInquiryMessage` from Task 3; `publishedWhere` from `app/_lib/server/spaces.ts`.
- **Produces:**
  - `type CreateResult = { kind: "created"; id: string } | { kind: "reused"; id: string } | { kind: "not-found" } | { kind: "own-space" } | { kind: "rate-limited" }`
  - `createInquiry(userId: string, input: NewInquiryInput, now?: Date): Promise<CreateResult>`
  - `type PostResult = { kind: "sent"; message: InquiryMessage } | { kind: "not-found" } | { kind: "closed" } | { kind: "rate-limited" }`
  - `postMessage(inquiryId: string, userId: string, body: string, now?: Date): Promise<PostResult>`
  - `type StatusResult = { kind: "ok"; status: InquiryStatus } | { kind: "not-found" } | { kind: "closed" } | { kind: "not-host" }`
  - `changeStatus(inquiryId: string, userId: string, action: "decline" | "close"): Promise<StatusResult>`

- [ ] **Step 1: Write the failing test** `app/_lib/server/inquiryWrites.test.ts`

```ts
/** @jest-environment node */
const mockSpaceFindFirst = jest.fn();
const mockInquiryFindUnique = jest.fn();
const mockInquiryFindFirst = jest.fn();
const mockInquiryCount = jest.fn();
const mockInquiryCreate = jest.fn();
const mockInquiryUpdate = jest.fn();
const mockMessageCount = jest.fn();
const mockMessageCreate = jest.fn();
const mockTransaction = jest.fn();

const db = {
	space: { findFirst: (...a: unknown[]) => mockSpaceFindFirst(...a) },
	inquiry: {
		findUnique: (...a: unknown[]) => mockInquiryFindUnique(...a),
		findFirst: (...a: unknown[]) => mockInquiryFindFirst(...a),
		count: (...a: unknown[]) => mockInquiryCount(...a),
		create: (...a: unknown[]) => mockInquiryCreate(...a),
		update: (...a: unknown[]) => mockInquiryUpdate(...a),
	},
	message: {
		count: (...a: unknown[]) => mockMessageCount(...a),
		create: (...a: unknown[]) => mockMessageCreate(...a),
	},
};
jest.mock("@/app/_lib/db", () => ({
	prisma: { ...db, $transaction: (...a: unknown[]) => mockTransaction(...a) },
}));

import { changeStatus, createInquiry, postMessage } from "@/app/_lib/server/inquiryWrites";
import { INQUIRIES_PER_USER_PER_DAY, MESSAGES_PER_USER_PER_HOUR } from "@/app/_lib/constants/inquiries";
import type { NewInquiryInput } from "@/app/_lib/types";

const now = new Date("2026-10-06T10:00:00Z");
const RENTER = "user_renter";
const HOST = "user_host";
const input: NewInquiryInput = {
	spaceSlug: "demo-poblacion-loft",
	requesterName: "Demo Renter",
	requesterCompany: null,
	shootDate: "2026-10-20",
	durationHours: 6,
	crewSize: 12,
	productionType: "COMMERCIAL",
	budgetNote: null,
	message: "Free on the 20th?",
	website: "",
};
const participationRow = (status = "NEW") => ({
	id: "inq_1",
	status,
	renterId: RENTER,
	requesterName: "Demo Renter",
	space: { host: { userId: HOST, displayName: "Demo Host A" } },
});

beforeEach(() => {
	jest.resetAllMocks();
	// Run the transaction callback against the same mocks.
	mockTransaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
	mockSpaceFindFirst.mockResolvedValue({ id: "space_1", host: { userId: HOST } });
	mockInquiryFindFirst.mockResolvedValue(null);
	mockInquiryCount.mockResolvedValue(0);
	mockMessageCount.mockResolvedValue(0);
	mockInquiryCreate.mockResolvedValue({ id: "inq_new" });
	mockMessageCreate.mockResolvedValue({ id: "m9", body: "Hi", senderId: RENTER, createdAt: now });
});

describe("createInquiry", () => {
	it("creates the inquiry and its first message for a published space", async () => {
		await expect(createInquiry(RENTER, input, now)).resolves.toEqual({ kind: "created", id: "inq_new" });
		expect(mockSpaceFindFirst).toHaveBeenCalledWith({
			where: { slug: "demo-poblacion-loft", status: "PUBLISHED", host: { verifiedAt: { not: null } } },
			select: { id: true, host: { select: { userId: true } } },
		});
		expect(mockInquiryCreate).toHaveBeenCalledWith({
			data: {
				spaceId: "space_1",
				renterId: RENTER,
				requesterName: "Demo Renter",
				requesterCompany: null,
				shootDate: new Date("2026-10-20T00:00:00.000Z"),
				durationHours: 6,
				crewSize: 12,
				productionType: "COMMERCIAL",
				budgetNote: null,
				lastMessageAt: now,
				renterLastReadAt: now,
				messages: { create: { senderId: RENTER, body: "Free on the 20th?", createdAt: now } },
			},
			select: { id: true },
		});
	});

	it("runs in a serializable transaction so two parallel submits can't open two threads", async () => {
		await createInquiry(RENTER, input, now);
		expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
	});

	it("returns not-found for an unpublished or unknown space", async () => {
		mockSpaceFindFirst.mockResolvedValue(null);
		await expect(createInquiry(RENTER, input, now)).resolves.toEqual({ kind: "not-found" });
		expect(mockInquiryCreate).not.toHaveBeenCalled();
	});

	it("refuses a host inquiring about their own space", async () => {
		await expect(createInquiry(HOST, input, now)).resolves.toEqual({ kind: "own-space" });
	});

	it("reuses the renter's open thread for the same space and appends the message", async () => {
		mockInquiryFindFirst.mockResolvedValue({ id: "inq_open" });
		await expect(createInquiry(RENTER, input, now)).resolves.toEqual({ kind: "reused", id: "inq_open" });
		expect(mockInquiryFindFirst).toHaveBeenCalledWith({
			where: { spaceId: "space_1", renterId: RENTER, status: { in: ["NEW", "RESPONDED"] } },
			select: { id: true },
		});
		expect(mockMessageCreate).toHaveBeenCalledWith({
			data: { inquiryId: "inq_open", senderId: RENTER, body: "Free on the 20th?", createdAt: now },
			select: { id: true },
		});
		expect(mockInquiryUpdate).toHaveBeenCalledWith({
			where: { id: "inq_open" },
			data: { lastMessageAt: now, renterLastReadAt: now },
			select: { id: true },
		});
		expect(mockInquiryCreate).not.toHaveBeenCalled();
	});

	it("rate-limits new inquiries per user per day", async () => {
		mockInquiryCount.mockResolvedValue(INQUIRIES_PER_USER_PER_DAY);
		await expect(createInquiry(RENTER, input, now)).resolves.toEqual({ kind: "rate-limited" });
		expect(mockInquiryCount).toHaveBeenCalledWith({
			where: { renterId: RENTER, createdAt: { gt: new Date("2026-10-05T10:00:00Z") } },
		});
		expect(mockInquiryCreate).not.toHaveBeenCalled();
	});

	it("rate-limits a reused thread by the per-hour message limit", async () => {
		mockInquiryFindFirst.mockResolvedValue({ id: "inq_open" });
		mockMessageCount.mockResolvedValue(MESSAGES_PER_USER_PER_HOUR);
		await expect(createInquiry(RENTER, input, now)).resolves.toEqual({ kind: "rate-limited" });
		expect(mockMessageCreate).not.toHaveBeenCalled();
	});
});

describe("postMessage", () => {
	it("returns not-found for a non-participant", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow());
		await expect(postMessage("inq_1", "user_stranger", "Hi", now)).resolves.toEqual({ kind: "not-found" });
		expect(mockMessageCreate).not.toHaveBeenCalled();
	});

	it("refuses a closed or declined thread", async () => {
		for (const status of ["CLOSED", "DECLINED"]) {
			mockInquiryFindUnique.mockResolvedValue(participationRow(status));
			await expect(postMessage("inq_1", RENTER, "Hi", now)).resolves.toEqual({ kind: "closed" });
		}
		expect(mockMessageCreate).not.toHaveBeenCalled();
	});

	it("rate-limits messages per user per hour", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow());
		mockMessageCount.mockResolvedValue(MESSAGES_PER_USER_PER_HOUR);
		await expect(postMessage("inq_1", RENTER, "Hi", now)).resolves.toEqual({ kind: "rate-limited" });
		expect(mockMessageCount).toHaveBeenCalledWith({
			where: { senderId: RENTER, createdAt: { gt: new Date("2026-10-06T09:00:00Z") } },
		});
	});

	it("host's first reply moves NEW to RESPONDED and marks the host read", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("NEW"));
		mockMessageCreate.mockResolvedValue({ id: "m9", body: "Yes", senderId: HOST, createdAt: now });
		await expect(postMessage("inq_1", HOST, "Yes", now)).resolves.toEqual({
			kind: "sent",
			message: { id: "m9", body: "Yes", sentAt: now.toISOString(), fromMe: true, senderName: "Demo Host A" },
		});
		expect(mockInquiryUpdate).toHaveBeenCalledWith({
			where: { id: "inq_1" },
			data: { lastMessageAt: now, hostLastReadAt: now, status: "RESPONDED" },
			select: { id: true },
		});
	});

	it("renter's message keeps the status and marks the renter read", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("NEW"));
		await postMessage("inq_1", RENTER, "Hi", now);
		expect(mockInquiryUpdate).toHaveBeenCalledWith({
			where: { id: "inq_1" },
			data: { lastMessageAt: now, renterLastReadAt: now },
			select: { id: true },
		});
	});
});

describe("changeStatus", () => {
	it("lets the host decline", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("RESPONDED"));
		mockInquiryUpdate.mockResolvedValue({ status: "DECLINED" });
		await expect(changeStatus("inq_1", HOST, "decline")).resolves.toEqual({ kind: "ok", status: "DECLINED" });
		expect(mockInquiryUpdate).toHaveBeenCalledWith({
			where: { id: "inq_1" },
			data: { status: "DECLINED" },
			select: { status: true },
		});
	});

	it("refuses decline from the renter", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow());
		await expect(changeStatus("inq_1", RENTER, "decline")).resolves.toEqual({ kind: "not-host" });
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});

	it("lets either side close", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow());
		mockInquiryUpdate.mockResolvedValue({ status: "CLOSED" });
		await expect(changeStatus("inq_1", RENTER, "close")).resolves.toEqual({ kind: "ok", status: "CLOSED" });
	});

	it("refuses a thread that's already closed, and hides threads from strangers", async () => {
		mockInquiryFindUnique.mockResolvedValue(participationRow("CLOSED"));
		await expect(changeStatus("inq_1", HOST, "close")).resolves.toEqual({ kind: "closed" });
		mockInquiryFindUnique.mockResolvedValue(participationRow());
		await expect(changeStatus("inq_1", "user_stranger", "close")).resolves.toEqual({ kind: "not-found" });
	});
});
```

- [ ] **Step 2:** Run the test. Expected: FAIL, because the module can't be found.

- [ ] **Step 3: Implement `app/_lib/server/inquiryWrites.ts`**

```ts
// Writes for inquiries: create (or reuse the open thread), post a message,
// decline or close. Expected outcomes are returned, not thrown; the route
// handlers map them to status codes.

import { INQUIRIES_PER_USER_PER_DAY, MESSAGES_PER_USER_PER_HOUR } from "@/app/_lib/constants/inquiries";
import { prisma } from "@/app/_lib/db";
import { getParticipation, isOpen, messageSelect, toInquiryMessage } from "@/app/_lib/server/inquiryAccess";
import { publishedWhere } from "@/app/_lib/server/spaces";
import type { InquiryMessage, InquiryStatus, NewInquiryInput } from "@/app/_lib/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type CreateResult =
	| { kind: "created"; id: string }
	| { kind: "reused"; id: string }
	| { kind: "not-found" }
	| { kind: "own-space" }
	| { kind: "rate-limited" };

export type PostResult =
	| { kind: "sent"; message: InquiryMessage }
	| { kind: "not-found" }
	| { kind: "closed" }
	| { kind: "rate-limited" };

export type StatusResult =
	| { kind: "ok"; status: InquiryStatus }
	| { kind: "not-found" }
	| { kind: "closed" }
	| { kind: "not-host" };

const OPEN_STATUSES: InquiryStatus[] = ["NEW", "RESPONDED"];

export async function createInquiry(userId: string, input: NewInquiryInput, now: Date = new Date()): Promise<CreateResult> {
	const space = await prisma.space.findFirst({
		where: { slug: input.spaceSlug, ...publishedWhere },
		select: { id: true, host: { select: { userId: true } } },
	});
	if (!space) return { kind: "not-found" };
	if (space.host.userId === userId) return { kind: "own-space" };

	// Serializable: two parallel submits can't both see "no open thread" and
	// create two. The loser throws P2034 and the route returns 500.
	return prisma.$transaction(
		async (tx): Promise<CreateResult> => {
			const open = await tx.inquiry.findFirst({
				where: { spaceId: space.id, renterId: userId, status: { in: OPEN_STATUSES } },
				select: { id: true },
			});

			if (open) {
				const sent = await tx.message.count({
					where: { senderId: userId, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
				});
				if (sent >= MESSAGES_PER_USER_PER_HOUR) return { kind: "rate-limited" };
				await tx.message.create({
					data: { inquiryId: open.id, senderId: userId, body: input.message, createdAt: now },
					select: { id: true },
				});
				await tx.inquiry.update({
					where: { id: open.id },
					data: { lastMessageAt: now, renterLastReadAt: now },
					select: { id: true },
				});
				return { kind: "reused", id: open.id };
			}

			const recent = await tx.inquiry.count({
				where: { renterId: userId, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
			});
			if (recent >= INQUIRIES_PER_USER_PER_DAY) return { kind: "rate-limited" };

			const created = await tx.inquiry.create({
				data: {
					spaceId: space.id,
					renterId: userId,
					requesterName: input.requesterName,
					requesterCompany: input.requesterCompany,
					shootDate: input.shootDate ? new Date(`${input.shootDate}T00:00:00.000Z`) : null,
					durationHours: input.durationHours,
					crewSize: input.crewSize,
					productionType: input.productionType,
					budgetNote: input.budgetNote,
					lastMessageAt: now,
					renterLastReadAt: now,
					messages: { create: { senderId: userId, body: input.message, createdAt: now } },
				},
				select: { id: true },
			});
			return { kind: "created", id: created.id };
		},
		{ isolationLevel: "Serializable" },
	);
}

export async function postMessage(
	inquiryId: string,
	userId: string,
	body: string,
	now: Date = new Date(),
): Promise<PostResult> {
	const p = await getParticipation(inquiryId, userId);
	if (!p) return { kind: "not-found" };
	if (!isOpen(p.status)) return { kind: "closed" };

	const sent = await prisma.message.count({
		where: { senderId: userId, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
	});
	if (sent >= MESSAGES_PER_USER_PER_HOUR) return { kind: "rate-limited" };

	const row = await prisma.$transaction(async (tx) => {
		const created = await tx.message.create({
			data: { inquiryId, senderId: userId, body, createdAt: now },
			select: messageSelect,
		});
		await tx.inquiry.update({
			where: { id: inquiryId },
			data:
				p.role === "HOST"
					? { lastMessageAt: now, hostLastReadAt: now, ...(p.status === "NEW" ? { status: "RESPONDED" as const } : {}) }
					: { lastMessageAt: now, renterLastReadAt: now },
			select: { id: true },
		});
		return created;
	});

	return { kind: "sent", message: toInquiryMessage(row, userId, p) };
}

export async function changeStatus(
	inquiryId: string,
	userId: string,
	action: "decline" | "close",
): Promise<StatusResult> {
	const p = await getParticipation(inquiryId, userId);
	if (!p) return { kind: "not-found" };
	if (!isOpen(p.status)) return { kind: "closed" };
	if (action === "decline" && p.role !== "HOST") return { kind: "not-host" };

	const updated = await prisma.inquiry.update({
		where: { id: inquiryId },
		data: { status: action === "decline" ? "DECLINED" : "CLOSED" },
		select: { status: true },
	});
	return { kind: "ok", status: updated.status };
}
```

  If the `{ isolationLevel: "Serializable" }` option name differs in Prisma 7.10, use its documented equivalent and adjust the test. Note that `prisma.$transaction(fn, options)` takes the options as its second argument.

- [ ] **Step 4:** Run the test. Expected: PASS. Then run `pnpm typecheck && pnpm lint`.
- [ ] **Step 5: Commit** with the message `feat(inquiries): create, reply, decline and close with limits`.

### Task 5: Route handlers

**Files:**
- Create: `app/api/inquiries/route.ts`, `app/api/inquiries/[id]/messages/route.ts`, `app/api/inquiries/[id]/status/route.ts`
- Test: `app/api/inquiries/routes.test.ts`

**Interfaces:**
- **Consumes:**
  - `getCurrentUser` (5a);
  - `validateNewInquiry`, `validateMessageBody` and `manilaToday` from Task 2;
  - `getMessagesAfter` from Task 3;
  - `createInquiry`, `postMessage` and `changeStatus` from Task 4.
- **Produces:** the HTTP contract in the spec's API table, with response bodies typed by the Task 0 API shapes.

- [ ] **Step 1: Write the failing test** `app/api/inquiries/routes.test.ts`

```ts
/** @jest-environment node */
const mockGetCurrentUser = jest.fn();
const mockCreateInquiry = jest.fn();
const mockPostMessage = jest.fn();
const mockChangeStatus = jest.fn();
const mockGetMessagesAfter = jest.fn();

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
```

- [ ] **Step 2:** Run the test with `pnpm test -- --runTestsByPath "app/api/inquiries/routes.test.ts"`. Expected: FAIL, because the modules can't be found.

- [ ] **Step 3: Implement `app/api/inquiries/route.ts`**

```ts
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { createInquiry } from "@/app/_lib/server/inquiryWrites";
import { manilaToday, validateNewInquiry } from "@/app/_lib/inquiryValidation";
import type { CreateInquiryResponse, InquiryApiError } from "@/app/_lib/types";

const error = (body: InquiryApiError, status: number) => Response.json(body, { status });

export async function POST(request: Request): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);

	const body: unknown = await request.json().catch(() => null);

	// Spam trap first: a bot that fills the hidden field gets a fake success,
	// whatever else it sent, so it learns nothing from validation errors.
	if (typeof body === "object" && body !== null && "website" in body && typeof body.website === "string" && body.website.trim() !== "") {
		return Response.json({ id: null, reused: false } satisfies CreateInquiryResponse, { status: 201 });
	}

	const result = validateNewInquiry(body, manilaToday());
	if (!result.ok) return error({ error: "VALIDATION", fields: result.errors }, 400);

	const outcome = await createInquiry(user.id, result.value);
	switch (outcome.kind) {
		case "created":
			return Response.json({ id: outcome.id, reused: false } satisfies CreateInquiryResponse, { status: 201 });
		case "reused":
			return Response.json({ id: outcome.id, reused: true } satisfies CreateInquiryResponse, { status: 200 });
		case "not-found":
			return error({ error: "NOT_FOUND" }, 404);
		case "own-space":
			return error({ error: "OWN_SPACE" }, 400);
		case "rate-limited":
			return error({ error: "RATE_LIMITED" }, 429);
	}
}
```

- [ ] **Step 4: Implement `app/api/inquiries/[id]/messages/route.ts`**

```ts
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { getMessagesAfter } from "@/app/_lib/server/inquiries";
import { postMessage } from "@/app/_lib/server/inquiryWrites";
import { validateMessageBody } from "@/app/_lib/inquiryValidation";
import type { InquiryApiError, MessagesResponse, PostMessageResponse } from "@/app/_lib/types";

type Context = { params: Promise<{ id: string }> };
const error = (body: InquiryApiError, status: number) => Response.json(body, { status });

export async function GET(request: Request, { params }: Context): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);
	const { id } = await params;
	const after = new URL(request.url).searchParams.get("after");
	const result = await getMessagesAfter(id, user.id, after);
	if (!result) return error({ error: "NOT_FOUND" }, 404);
	return Response.json(result satisfies MessagesResponse);
}

export async function POST(request: Request, { params }: Context): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);
	const { id } = await params;

	const body: unknown = await request.json().catch(() => null);
	const raw = typeof body === "object" && body !== null && "body" in body ? body.body : undefined;
	const validated = validateMessageBody(raw);
	if (!validated.ok) return error({ error: "VALIDATION" }, 400);

	const outcome = await postMessage(id, user.id, validated.value);
	switch (outcome.kind) {
		case "sent":
			return Response.json({ message: outcome.message } satisfies PostMessageResponse, { status: 201 });
		case "not-found":
			return error({ error: "NOT_FOUND" }, 404);
		case "closed":
			return error({ error: "THREAD_CLOSED" }, 409);
		case "rate-limited":
			return error({ error: "RATE_LIMITED" }, 429);
	}
}
```

- [ ] **Step 5: Implement `app/api/inquiries/[id]/status/route.ts`**

```ts
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { changeStatus } from "@/app/_lib/server/inquiryWrites";
import type { InquiryApiError, StatusResponse } from "@/app/_lib/types";

type Context = { params: Promise<{ id: string }> };
const error = (body: InquiryApiError, status: number) => Response.json(body, { status });

export async function POST(request: Request, { params }: Context): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);
	const { id } = await params;

	const body: unknown = await request.json().catch(() => null);
	const action = typeof body === "object" && body !== null && "action" in body ? body.action : undefined;
	if (action !== "decline" && action !== "close") return error({ error: "VALIDATION" }, 400);

	const outcome = await changeStatus(id, user.id, action);
	switch (outcome.kind) {
		case "ok":
			return Response.json({ status: outcome.status } satisfies StatusResponse);
		case "not-found":
			return error({ error: "NOT_FOUND" }, 404);
		case "closed":
			return error({ error: "THREAD_CLOSED" }, 409);
		case "not-host":
			return error({ error: "NOT_HOST" }, 400);
	}
}
```

  If Next 16's generated route types reject the hand-written `Context` type during `pnpm build`, switch to Next's `RouteContext<"/api/inquiries/[id]/messages">` helper (see `node_modules/next/dist/docs/`) and report the change.

- [ ] **Step 6:** Run the test. Expected: PASS. Then run `pnpm typecheck && pnpm lint && pnpm test`, and `pnpm build` with the throwaway `BETTER_AUTH_*` values.
- [ ] **Step 7: Manual round trip** against local Docker, using `pnpm dev` with throwaway secrets:
  1. Sign in two users with magic links from the dev log: a renter, and a user whose email you set on a verified demo host via SQL. Back up the original email first.
  2. `POST /api/inquiries` as the renter. Expected: 201.
  3. POST again for the same space. Expected: 200 `reused`.
  4. `GET …/messages` as a third signed-in user. Expected: 404.
  5. Reply as the host. Expected: 201, and the status becomes `RESPONDED`.
  6. `POST …/status {"action":"decline"}` as the renter. Expected: 400 `NOT_HOST`.
  7. Close it as the host. Then post a message. Expected: 409.
  8. Restore the host email, delete every row you created, and delete the logs containing tokens.
- [ ] **Step 8: Commit** with the message `feat(inquiries): API routes for inquiries, messages and status`.
- [ ] **Step 9: Checkpoint.** Stop here. The main session sends this PR to `reviewer`.

---

## After Part B

- [ ] **Main session:** fresh `reviewer` pass, a fix pass if needed, then the PR "Slice 5b-1 — inquiries data and API".
- [ ] **Main session:** after 5b-1 merges, write the plans for 5b-2 (inquiry form and notifications) and 5b-3 (inbox and thread pages) against the merged code.
