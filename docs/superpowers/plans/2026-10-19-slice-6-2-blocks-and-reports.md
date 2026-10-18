# Slice 6-2 — Blocks and Reports API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the server, two users who share a thread can block each other and either can report it. A blocked pair, or a host whose `verifiedAt` was removed, can no longer message.

**Architecture:**
- **One rule, worked out at read time.** `getParticipation` (`app/_lib/server/inquiryAccess.ts`) also loads blocks between the pair and `host.verifiedAt`, and returns `canSend` and `blockedByMe`. Every write, the thread read, the poll and the notifier use `canSend`. No thread status is ever rewritten.
- **New server modules:** `blocks.ts` (block and unblock), `reports.ts` (create and rate-limit), `reportNotify.ts` (the ops email).
- **New validator:** `app/_lib/reportValidation.ts`. It's pure, so 6-3's dialog can share it.
- **New routes:** `POST`/`DELETE /api/inquiries/[id]/block` and `POST /api/inquiries/[id]/report`.

**Tech Stack:** Prisma 7 with `@prisma/adapter-pg` (client generated to `generated/prisma`), Next.js 16.4 route handlers, `after()`, Jest 30 in the node environment with a mocked `prisma`.

**Spec:** `docs/superpowers/specs/2026-10-18-slice-6-safety-design.md`, sections **Data model**, **Contract**, **Access rules** and **API**. Also the item 6-1 moved here: "`notifyCounterpart` sends nothing when the thread can't take messages."

## Global Constraints

- **Branch:** `feat/slice-6-2-blocks-reports`, stacked on `feat/slice-6-safety` (PR #18). Commit locally at each commit step, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push or rebase.
- **Ownership:**
  - Tasks 1, 2, 3, 5 and 6 go to `backend-dev`. Task 4 (one fixture line) goes to `frontend-dev`.
  - The `app/_lib/types.ts` changes are approved as written in Task 1, and nothing else in that file changes.
  - Adding to `app/_lib/constants/**` is allowed. Changing existing values there is not.
- **Off limits:** new dependencies, lockfiles, `.env*`, hand-edits under `prisma/migrations/**` (generate with the CLI) and `generated/**`.
- **Privacy:**
  - No public type, response or log line gains an email, a phone or a user id. `blockedByMe` is a boolean, and nothing says the *other* side blocked you.
  - `Report.detail` is never logged and never emailed.
  - Log lines carry ids only.
- **Read access never changes.** A participant can always read their thread, whatever the blocks or the host's verification.
- **`canSend = isOpen(status) && hostVerified && no block in either direction`.**
  - When `!canSend`: `canReply`, `canDecline` and `canClose` are false, and reply, decline and close return 409 `THREAD_CLOSED`.
  - Report and block work on any thread you're in, open or not.
- **`POST /api/inquiries`** returns 403 `BLOCKED` when a block exists either way between the renter and the space's host user. This is checked **before** open-thread reuse.
- **Copy and values, verbatim:**
  - `REPORTS_PER_USER_PER_DAY = 10`, `REPORT_DETAIL_MAX = 1000`;
  - ops email subject `Report: {REASON}`;
  - log line `[report] no REPORTS_EMAIL_TO`.
- **TypeScript strict.** No `any`, no `@ts-ignore`, no non-null `!`.
- **Tests come first.** Watch each new test fail before implementing.
- **Commands:**
  - One file: `pnpm exec jest "<path regex>"`. Bracketed paths need a regex.
  - Then `pnpm typecheck` and `pnpm lint`.
  - The migration needs Docker. If `docker info` fails, run `open -a Docker`, wait until it succeeds, then `docker compose up -d`.

## Review Focus

1. **Blocks in both directions.** A blocks B, and B separately blocks A. A unblocking leaves the thread read-only, and only B's own unblock reopens it. Test: Task 5.
2. **A host that hasn't linked an account.** `host.userId` is null, so there's no user to block. Blocking returns 409 `NOT_LINKED`, never a 500 or a block row with a null id. Reading and reporting still work. Test: Task 5.
3. **A race between a block and a reply already in flight.** The reply's write-time recheck covers status only, so a block that lands mid-request lets one message through. That's accepted (the next poll shows read-only) and stated in a comment. The notifier re-checks `canSend` before emailing, so the blocker is never emailed about it. Test: Task 2 (notify skips when blocked).
4. **The host loses verification while threads are open.** The next poll returns `canReply: false`, replies get 409, and nothing is emailed. Restoring `verifiedAt` restores `canReply: true` with no data repair. Test: Task 2.
5. **A report body that isn't what's expected.** Malformed JSON, an unknown reason, a non-string detail, a NUL character or 1001 characters each give 400 `VALIDATION` with field errors, never a 500. Test: Task 6.

## PR boundary

Tasks 1–4 are **6-2a** (contract, the rule, `BLOCKED`). Tasks 5–6 are **6-2b** (block and report routes). Each half passes typecheck, tests and build on its own.

---

### Task 1: Schema, migration, contract, labels and limits

**Files:**
- Modify: `prisma/schema.prisma` (new `Block` and `Report` models and `ReportReason` enum; relations on `User` and `Inquiry`)
- Create: `prisma/migrations/<timestamp>_blocks_and_reports/migration.sql`, generated by the CLI
- Modify: `app/_lib/types.ts`
- Modify: `app/_lib/constants/labels.ts`, `app/_lib/constants/inquiries.ts`
- Test: `app/_lib/constants/labels.test.ts` (create it if missing; if it exists, add to it)

**Interfaces:**
- Produces:
  - the Prisma models `block` and `report`;
  - the enum `ReportReason` from `@/generated/prisma/enums`;
  - in `types.ts`: `ReportReason`, `NewReportInput`, `ReportFieldErrors`, `CreateReportResponse`, `BlockResponse`, plus the widened `InquiryThread`, `MessagesResponse` and `InquiryApiError`;
  - `reportReasonLabels: Record<ReportReason, string>`;
  - `REPORTS_PER_USER_PER_DAY`, `REPORT_DETAIL_MAX`.

- [ ] **Step 1: Write the failing label test**

```ts
import { reportReasonLabels } from "@/app/_lib/constants/labels";
import { ReportReason } from "@/generated/prisma/enums";

it("labels every report reason", () => {
	expect(Object.keys(reportReasonLabels).sort()).toEqual(Object.values(ReportReason).sort());
	expect(reportReasonLabels).toEqual({
		SPAM: "Spam",
		SCAM_OR_PHISHING: "Scam or phishing",
		HARASSMENT: "Harassment",
		NOT_THEIR_SPACE: "Not their space to list",
		OTHER: "Something else",
	});
});
```

Run: `pnpm exec jest "constants/labels"`. Expected: FAIL. The enum and the labels don't exist yet.

- [ ] **Step 2: Schema**

In `prisma/schema.prisma`, under `// ---------------------------------------------------------------- inquiries`, after `model Message`, add:

```prisma
// One user has blocked another. User to user, not per thread: it covers every
// thread they share and stops new inquiries between them. Unblocking deletes
// the row. Never shown to the blocked side.
model Block {
  id        String   @id @default(cuid())
  blockerId String
  blocker   User     @relation("BlocksMade", fields: [blockerId], references: [id], onDelete: Cascade)
  blockedId String
  blocked   User     @relation("BlocksReceived", fields: [blockedId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([blockerId, blockedId])
  @@index([blockedId])
}

// Reviewed by a human in Prisma Studio. Never acted on automatically.
model Report {
  id         String       @id @default(cuid())
  reporterId String
  reporter   User         @relation(fields: [reporterId], references: [id], onDelete: Cascade)
  inquiryId  String
  inquiry    Inquiry      @relation(fields: [inquiryId], references: [id], onDelete: Cascade)
  reason     ReportReason
  detail     String?      @db.Text // PRIVATE to ops. 1–1000 chars, trimmed. Never logged, never emailed.
  createdAt  DateTime     @default(now())
  reviewedAt DateTime?
  notes      String?      @db.Text // ops only

  @@index([reviewedAt, createdAt])
  @@index([reporterId, createdAt])
}
```

In `model User`, after `messages  Message[]`, add:

```prisma
  blocksMade     Block[]  @relation("BlocksMade")
  blocksReceived Block[]  @relation("BlocksReceived")
  reports        Report[]
```

In `model Inquiry`, after `messages Message[]`, add `reports Report[]`.

In the enums section, after `enum InquiryStatus`, add:

```prisma
enum ReportReason {
  SPAM
  SCAM_OR_PHISHING
  HARASSMENT
  NOT_THEIR_SPACE
  OTHER
}
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm exec prisma migrate dev --name blocks_and_reports` (start Docker first if needed; see Global Constraints).
Expected: a new `prisma/migrations/*_blocks_and_reports/migration.sql` that creates `Block`, `Report` and the enum, and regenerates the client. Don't edit the SQL.

- [ ] **Step 4: Contract**

In `app/_lib/types.ts`:

- Add `ReportReason` to the `export type { … } from "@/generated/prisma/enums"` list, after `InquiryStatus`.
- In `InquiryThread`, replace the three `can…` lines with:

```ts
	canReply: boolean; // false while closed, blocked either way, or the host is unverified
	canDecline: boolean; // same conditions, plus host only
	canClose: boolean; // same conditions
	blockedByMe: boolean; // drives "You blocked {name}." and Unblock
```

- Replace the `InquiryApiError` type with:

```ts
export type InquiryApiError = {
	error:
		| "UNAUTHENTICATED"
		| "VALIDATION"
		| "OWN_SPACE"
		| "NOT_FOUND"
		| "RATE_LIMITED"
		| "THREAD_CLOSED"
		| "NOT_HOST"
		| "BLOCKED" // POST /api/inquiries only
		| "NOT_LINKED"; // POST /api/inquiries/[id]/block: the host hasn't signed in yet
	fields?: InquiryFieldErrors;
};
```

- Replace `MessagesResponse` with:

```ts
// GET /api/inquiries/[id]/messages?after=<messageId> — 200
export type MessagesResponse = { messages: InquiryMessage[]; status: InquiryStatus; canReply: boolean };
```

- Append:

```ts
// POST /api/inquiries/[id]/report — 201
export type NewReportInput = { reason: ReportReason; detail: string | null };
export type ReportFieldErrors = Partial<Record<keyof NewReportInput, string>>;
export type CreateReportResponse = { id: string };
// The report route's errors. Separate from InquiryApiError so the inquiry form's
// `fields` stays keyed by NewInquiryInput.
export type ReportApiError = { error: InquiryApiError["error"]; fields?: ReportFieldErrors };

// POST and DELETE /api/inquiries/[id]/block — 200
export type BlockResponse = { blockedByMe: boolean };
```

`ReportReason` must also be importable inside `types.ts`. If the file uses a separate `import type { … } from "@/generated/prisma/enums"` for its own references (it does for `InquiryStatus`), add `ReportReason` there too.

- [ ] **Step 5: Labels and limits**

In `app/_lib/constants/labels.ts`, import `ReportReason` the same way the file imports `InquiryStatus`, and append:

```ts
export const reportReasonLabels: Record<ReportReason, string> = {
	SPAM: "Spam",
	SCAM_OR_PHISHING: "Scam or phishing",
	HARASSMENT: "Harassment",
	NOT_THEIR_SPACE: "Not their space to list",
	OTHER: "Something else",
};
```

In `app/_lib/constants/inquiries.ts`, append:

```ts
export const REPORTS_PER_USER_PER_DAY = 10;
export const REPORT_DETAIL_MAX = 1000;
```

- [ ] **Step 6: Run checks**

Run: `pnpm exec jest "constants/labels"`. Expected: PASS.
Run: `pnpm typecheck`. Expected: errors in exactly these places, and nowhere else:
- `app/_lib/server/inquiries.ts`: `InquiryThread` is missing `blockedByMe`, and `MessagesResponse` is missing `canReply`;
- `app/_components/testing.tsx`: `demoThread` is missing `blockedByMe`.

Task 2 fixes the first and Task 4 the second. Record the exact errors in your report. Don't fix them here.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations app/_lib/types.ts app/_lib/constants/labels.ts app/_lib/constants/labels.test.ts app/_lib/constants/inquiries.ts
git commit -m "feat(safety): Block and Report models, contract and labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The read-only rule

**Files:**
- Modify: `app/_lib/server/inquiryAccess.ts` (`Participation`, `participationSelect`, `getParticipation`, plus new `blockersBetween` and `canSendIn`)
- Modify: `app/_lib/server/inquiryWrites.ts` (`postMessage`, `changeStatus`)
- Modify: `app/_lib/server/inquiries.ts` (`getInquiryThread`, `getMessagesAfter`)
- Modify: `app/_lib/server/inquiryNotify.ts`
- Test: `app/_lib/server/inquiryAccess.test.ts`, `inquiryWrites.test.ts`, `inquiries.test.ts`, `inquiryNotify.test.ts`

**Interfaces:**
- Consumes: the `prisma.block` model and the `InquiryThread`/`MessagesResponse` fields from Task 1.
- Produces, in `inquiryAccess.ts`:

```ts
export type Participation = {
	id: string;
	status: InquiryStatus;
	role: InquiryRole;
	renterId: string;
	requesterName: string;
	hostDisplayName: string;
	hostUserId: string | null;
	canSend: boolean;
	blockedByMe: boolean;
};
export async function blockersBetween(renterId: string, hostUserId: string | null): Promise<string[]>;
export function canSendIn(status: InquiryStatus, hostVerified: boolean, blockerIds: readonly string[]): boolean;
```

- [ ] **Step 1: Write the failing rule tests**

In `app/_lib/server/inquiryAccess.test.ts`:
- extend the `@/app/_lib/db` mock with `inquiry.findUnique` (`mockInquiryFindUnique`) and `block.findMany` (`mockBlockFindMany`);
- import `getParticipation`, `blockersBetween` and `canSendIn`;
- add:

```ts
const RENTER = "user_renter";
const HOST = "user_host";
const row = (status: string, verifiedAt: Date | null = new Date("2026-10-01T00:00:00Z"), hostUserId: string | null = HOST) => ({
	id: "inq_1",
	status,
	renterId: RENTER,
	requesterName: "Demo Renter",
	space: { host: { userId: hostUserId, displayName: "Demo Host A", verifiedAt } },
});

describe("canSendIn", () => {
	it.each([
		["NEW", true, [], true],
		["RESPONDED", true, [], true],
		["DECLINED", true, [], false],
		["CLOSED", true, [], false],
		["NEW", false, [], false],
		["NEW", true, [RENTER], false],
		["NEW", true, [HOST], false],
		["NEW", true, [RENTER, HOST], false],
		["CLOSED", false, [HOST], false],
	] as const)("status %s, verified %s, blockers %j → %s", (status, verified, blockers, expected) => {
		expect(canSendIn(status, verified, blockers)).toBe(expected);
	});
});

describe("blockersBetween", () => {
	it("asks for blocks in both directions and returns the blocker ids", async () => {
		mockBlockFindMany.mockResolvedValue([{ blockerId: HOST }]);
		await expect(blockersBetween(RENTER, HOST)).resolves.toEqual([HOST]);
		expect(mockBlockFindMany).toHaveBeenCalledWith({
			where: { OR: [{ blockerId: RENTER, blockedId: HOST }, { blockerId: HOST, blockedId: RENTER }] },
			select: { blockerId: true },
		});
	});
	it("is empty without querying when the host isn't linked", async () => {
		await expect(blockersBetween(RENTER, null)).resolves.toEqual([]);
		expect(mockBlockFindMany).not.toHaveBeenCalled();
	});
});

describe("getParticipation", () => {
	it.each([
		// viewer, blockers, verified, canSend, blockedByMe
		[RENTER, [], true, true, false],
		[RENTER, [RENTER], true, false, true],
		[RENTER, [HOST], true, false, false],
		[RENTER, [RENTER, HOST], true, false, true],
		[HOST, [HOST], true, false, true],
		[HOST, [RENTER], true, false, false],
		[RENTER, [], false, false, false],
		[HOST, [], false, false, false],
	] as const)("viewer %s, blockers %j, verified %s → canSend %s, blockedByMe %s", async (viewer, blockers, verified, canSend, blockedByMe) => {
		mockInquiryFindUnique.mockResolvedValue(row("NEW", verified ? new Date("2026-10-01T00:00:00Z") : null));
		mockBlockFindMany.mockResolvedValue(blockers.map((blockerId) => ({ blockerId })));
		const p = await getParticipation("inq_1", viewer);
		expect(p).toMatchObject({ role: viewer === RENTER ? "RENTER" : "HOST", canSend, blockedByMe });
	});

	it("still lets an unverified host and a blocked renter read (participation is not null)", async () => {
		mockInquiryFindUnique.mockResolvedValue(row("NEW", null));
		mockBlockFindMany.mockResolvedValue([{ blockerId: HOST }]);
		await expect(getParticipation("inq_1", HOST)).resolves.not.toBeNull();
		await expect(getParticipation("inq_1", RENTER)).resolves.not.toBeNull();
	});

	it("is null for someone outside the thread, and doesn't look up blocks", async () => {
		mockInquiryFindUnique.mockResolvedValue(row("NEW"));
		await expect(getParticipation("inq_1", "user_other")).resolves.toBeNull();
		expect(mockBlockFindMany).not.toHaveBeenCalled();
	});

	it("selects the host's verifiedAt and nothing private", async () => {
		mockInquiryFindUnique.mockResolvedValue(row("NEW"));
		mockBlockFindMany.mockResolvedValue([]);
		await getParticipation("inq_1", RENTER);
		expect(mockInquiryFindUnique).toHaveBeenCalledWith({
			where: { id: "inq_1" },
			select: {
				id: true,
				status: true,
				renterId: true,
				requesterName: true,
				space: { select: { host: { select: { userId: true, displayName: true, verifiedAt: true } } } },
			},
		});
	});
});
```

The existing `isHostOfSpace` tests stay as they are.

- [ ] **Step 2: Write the failing caller tests**

`inquiryWrites.test.ts`:
- add `block: { findMany: (...a) => mockBlockFindMany(...a) }` to `db`, with a lazy `get block()` in the `prisma` mock like the others;
- default `mockBlockFindMany.mockResolvedValue([])` in `beforeEach`;
- add `verifiedAt: new Date("2026-10-01T00:00:00Z")` to `participationRow`'s `host`;
- add:

```ts
describe("read-only threads", () => {
	it.each([
		["blocked by the host", [{ blockerId: HOST }], new Date("2026-10-01T00:00:00Z")],
		["blocked by the renter", [{ blockerId: RENTER }], new Date("2026-10-01T00:00:00Z")],
		["host unverified", [], null],
	])("postMessage and changeStatus return closed when %s, and write nothing", async (_label, blocks, verifiedAt) => {
		const r = participationRow("RESPONDED");
		mockInquiryFindUnique.mockResolvedValue({ ...r, space: { host: { ...r.space.host, verifiedAt } } });
		mockBlockFindMany.mockResolvedValue(blocks);
		await expect(postMessage("inq_1", RENTER, "Hi")).resolves.toEqual({ kind: "closed" });
		await expect(changeStatus("inq_1", HOST, "close")).resolves.toEqual({ kind: "closed" });
		await expect(changeStatus("inq_1", HOST, "decline")).resolves.toEqual({ kind: "closed" });
		expect(mockTransaction).not.toHaveBeenCalled();
		expect(mockInquiryUpdateMany).not.toHaveBeenCalled();
		expect(mockMessageCreate).not.toHaveBeenCalled();
	});
});
```

(If `participationRow` uses a different variable name for the host or renter id, use the file's own constants.)

`inquiries.test.ts`:
- add a `block.findMany` mock (`mockBlockFindMany`), defaulting to `[]` in `beforeEach`;
- add `verifiedAt: new Date("2026-10-01T00:00:00Z")` to `participationRow.space.host`;
- in every existing assertion on a full `InquiryThread`, add `blockedByMe: false`;
- in every existing assertion on a `MessagesResponse`, add `canReply: true` (or `canReply: false` where the row's status is closed);
- then add:

```ts
describe("read-only state", () => {
	const hostRow = (verifiedAt: Date | null) => ({ ...participationRow, status: "RESPONDED", space: { host: { ...participationRow.space.host, verifiedAt } } });
	const threadRow = {
		id: "inq_1",
		status: "RESPONDED",
		requesterCompany: null,
		shootDate: null,
		durationHours: null,
		crewSize: null,
		productionType: "FILM",
		budgetNote: null,
		space: { slug: "demo-poblacion-loft", title: "[DEMO] Corner loft", areaName: "Poblacion", city: "MAKATI" },
		messages: [msg("m1", RENTER, "2026-10-07T10:00:00Z")],
	};

	it("a renter who blocked the host can read, can't act, and sees blockedByMe", async () => {
		mockInquiryFindUnique.mockResolvedValueOnce(hostRow(new Date("2026-10-01T00:00:00Z"))).mockResolvedValueOnce(threadRow);
		mockBlockFindMany.mockResolvedValue([{ blockerId: RENTER }]);
		const thread = await getInquiryThread("inq_1", RENTER);
		expect(thread).toMatchObject({ status: "RESPONDED", canReply: false, canDecline: false, canClose: false, blockedByMe: true });
		expect(thread?.messages).toHaveLength(1);
	});

	it("the blocked side sees the same read-only state with blockedByMe false", async () => {
		mockInquiryFindUnique.mockResolvedValueOnce(hostRow(new Date("2026-10-01T00:00:00Z"))).mockResolvedValueOnce(threadRow);
		mockBlockFindMany.mockResolvedValue([{ blockerId: RENTER }]);
		const thread = await getInquiryThread("inq_1", HOST);
		expect(thread).toMatchObject({ canReply: false, canDecline: false, canClose: false, blockedByMe: false });
	});

	it("an unverified host's thread is read-only for both sides; the poll says canReply false", async () => {
		mockInquiryFindUnique.mockResolvedValue(hostRow(null));
		mockMessageFindMany.mockResolvedValue([]);
		await expect(getMessagesAfter("inq_1", RENTER, null)).resolves.toMatchObject({ status: "RESPONDED", canReply: false });
	});

	it("re-verifying restores canReply on the next poll with no other write", async () => {
		mockInquiryFindUnique.mockResolvedValue(hostRow(new Date("2026-10-19T00:00:00Z")));
		mockMessageFindMany.mockResolvedValue([]);
		await expect(getMessagesAfter("inq_1", RENTER, null)).resolves.toMatchObject({ canReply: true });
		expect(mockInquiryUpdate).not.toHaveBeenCalled();
	});
});
```

`inquiryNotify.test.ts`:
- add a `block: { findMany }` mock (`mockBlockFindMany`, default `[]`);
- in `row()`, add `status: "RESPONDED"` and `renterId: "user_renter"`, and on `space.host` add `userId: hostUser ? "user_host" : null` and `verifiedAt: new Date("2026-10-01T00:00:00Z")`;
- update the pinned-`select` test to:

```ts
		select: {
			id: true,
			status: true,
			renterId: true,
			renter: { select: { email: true } },
			space: {
				select: {
					title: true,
					host: { select: { userId: true, verifiedAt: true, contactEmail: true, user: { select: { email: true } } } },
				},
			},
		},
```

- then add:

```ts
it.each([
	["the host blocked the renter", { blocks: [{ blockerId: "user_host" }] }],
	["the renter blocked the host", { blocks: [{ blockerId: "user_renter" }] }],
	["the host is unverified", { verifiedAt: null }],
	["the thread is closed", { status: "CLOSED" }],
])("sends nothing and claims no slot when %s", async (_label, change: { blocks?: { blockerId: string }[]; verifiedAt?: null; status?: string }) => {
	const base = row();
	mockFindUnique.mockResolvedValue({
		...base,
		status: change.status ?? base.status,
		space: { ...base.space, host: { ...base.space.host, verifiedAt: change.verifiedAt === null ? null : base.space.host.verifiedAt } },
	});
	mockBlockFindMany.mockResolvedValue(change.blocks ?? []);
	await notifyCounterpart("inq_1", "RENTER", now);
	expect(mockUpdateMany).not.toHaveBeenCalled();
	expect(mockSend).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `pnpm exec jest "inquiryAccess|inquiryWrites|server/inquiries|inquiryNotify"`
Expected: FAIL. The new exports don't exist, `canSend` is ignored, and the select isn't updated.

- [ ] **Step 4: Implement the rule**

In `app/_lib/server/inquiryAccess.ts`, update the top comment's last sentence to: `Participation deliberately ignores the space's publish state, blocks and the host's verification: those decide whether a thread can take messages (canSend), never whether it can be read.` Then:

```ts
export type Participation = {
	id: string;
	status: InquiryStatus;
	role: InquiryRole;
	renterId: string;
	requesterName: string;
	hostDisplayName: string;
	hostUserId: string | null;
	canSend: boolean; // open, host verified, and no block either way
	blockedByMe: boolean;
};

const participationSelect = {
	id: true,
	status: true,
	renterId: true,
	requesterName: true,
	space: { select: { host: { select: { userId: true, displayName: true, verifiedAt: true } } } },
} satisfies Prisma.InquirySelect;

// The ids of whichever of the two has blocked the other. An unlinked host has
// no user, so can neither block nor be blocked.
export async function blockersBetween(renterId: string, hostUserId: string | null): Promise<string[]> {
	if (!hostUserId) return [];
	const rows = await prisma.block.findMany({
		where: { OR: [{ blockerId: renterId, blockedId: hostUserId }, { blockerId: hostUserId, blockedId: renterId }] },
		select: { blockerId: true },
	});
	return rows.map((row) => row.blockerId);
}

export function canSendIn(status: InquiryStatus, hostVerified: boolean, blockerIds: readonly string[]): boolean {
	return isOpen(status) && hostVerified && blockerIds.length === 0;
}

export async function getParticipation(inquiryId: string, userId: string): Promise<Participation | null> {
	const row = await prisma.inquiry.findUnique({ where: { id: inquiryId }, select: participationSelect });
	if (!row) return null;
	const host = row.space.host;
	const role: InquiryRole | null = row.renterId === userId ? "RENTER" : host.userId === userId ? "HOST" : null;
	if (!role) return null;
	const blockers = await blockersBetween(row.renterId, host.userId);
	return {
		id: row.id,
		status: row.status,
		role,
		renterId: row.renterId,
		requesterName: row.requesterName,
		hostDisplayName: host.displayName,
		hostUserId: host.userId,
		canSend: canSendIn(row.status, host.verifiedAt !== null, blockers),
		blockedByMe: blockers.includes(userId),
	};
}
```

`isOpen` must be declared above `canSendIn`, or stay a function declaration (it is one now, so hoisting covers it).

In `app/_lib/server/inquiryWrites.ts`, replace `if (!isOpen(p.status)) return { kind: "closed" };` with `if (!p.canSend) return { kind: "closed" };` in both `postMessage` and `changeStatus`. Remove `isOpen` from the import if it's now unused. Above the transaction in `postMessage`, extend the comment:

```ts
	// The open-status guard is re-checked inside the write: a close or decline
	// that lands after getParticipation must win, not be overwritten. A block or
	// a verification change landing in that window is not re-checked; at most
	// one message gets through, and the notifier re-checks before emailing.
```

In `app/_lib/server/inquiries.ts`:
- in `getInquiryThread`, replace `const open = isOpen(row.status);` and the three `can…` lines with:

```ts
		canReply: p.canSend,
		canDecline: p.canSend && p.role === "HOST",
		canClose: p.canSend,
		blockedByMe: p.blockedByMe,
```

- in `getMessagesAfter`, return `{ status: p.status, canReply: p.canSend, messages: … }`;
- remove `isOpen` from the import if unused.

In `app/_lib/server/inquiryNotify.ts`:
- import `blockersBetween` and `canSendIn` from `@/app/_lib/server/inquiryAccess`;
- update the top comment to add: `Nothing is sent for a thread that can't take messages (closed, blocked, or an unverified host).`;
- use this select:

```ts
			select: {
				id: true,
				status: true,
				renterId: true,
				renter: { select: { email: true } },
				space: {
					select: {
						title: true,
						host: { select: { userId: true, verifiedAt: true, contactEmail: true, user: { select: { email: true } } } },
					},
				},
			},
```

- after `if (!row) return;` and **before** `claim`, add:

```ts
		const host = row.space.host;
		if (!canSendIn(row.status, host.verifiedAt !== null, await blockersBetween(row.renterId, host.userId))) return;
```

- remove the later `const host = row.space.host;` so it isn't declared twice.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm exec jest "inquiryAccess|inquiryWrites|server/inquiries|inquiryNotify|api/inquiries"`
Expected: PASS.

Run: `pnpm typecheck`. Expected: the only remaining error is `demoThread` in `app/_components/testing.tsx`, which is Task 4.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/server/inquiryAccess.ts app/_lib/server/inquiryAccess.test.ts app/_lib/server/inquiryWrites.ts app/_lib/server/inquiryWrites.test.ts app/_lib/server/inquiries.ts app/_lib/server/inquiries.test.ts app/_lib/server/inquiryNotify.ts app/_lib/server/inquiryNotify.test.ts
git commit -m "feat(safety): blocked pairs and unverified hosts make a thread read-only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `BLOCKED` on new inquiries

**Files:**
- Modify: `app/_lib/server/inquiryWrites.ts` (`CreateResult`, `createInquiry`)
- Modify: `app/api/inquiries/route.ts`
- Test: `app/_lib/server/inquiryWrites.test.ts`, `app/api/inquiries/routes.test.ts`

**Interfaces:**
- Consumes: `blockersBetween(renterId, hostUserId)` from Task 2.
- Produces: `CreateResult` gains `{ kind: "blocked" }`, which the route maps to 403 `{ error: "BLOCKED" }`.

- [ ] **Step 1: Write the failing tests**

`inquiryWrites.test.ts`, in the `createInquiry` describe:

```ts
	it.each([["the host blocked the renter", HOST], ["the renter blocked the host", RENTER]])(
		"returns blocked when %s, before looking for an open thread",
		async (_label, blockerId) => {
			mockSpaceFindFirst.mockResolvedValue({ id: "space_1", host: { userId: HOST } });
			mockBlockFindMany.mockResolvedValue([{ blockerId }]);
			await expect(createInquiry(RENTER, input)).resolves.toEqual({ kind: "blocked" });
			expect(mockBlockFindMany).toHaveBeenCalledWith({
				where: { OR: [{ blockerId: RENTER, blockedId: HOST }, { blockerId: HOST, blockedId: RENTER }] },
				select: { blockerId: true },
			});
			expect(mockTransaction).not.toHaveBeenCalled();
			expect(mockInquiryFindFirst).not.toHaveBeenCalled();
		},
	);

	it("checks no blocks for an unlinked host and carries on", async () => {
		mockSpaceFindFirst.mockResolvedValue({ id: "space_1", host: { userId: null } });
		mockInquiryFindFirst.mockResolvedValue(null);
		mockInquiryCount.mockResolvedValue(0);
		mockInquiryCreate.mockResolvedValue({ id: "inq_new" });
		await expect(createInquiry(RENTER, input)).resolves.toEqual({ kind: "created", id: "inq_new" });
		expect(mockBlockFindMany).not.toHaveBeenCalled();
	});
```

Use the file's existing name for the valid `NewInquiryInput` fixture. It's shown above as `input`.

`routes.test.ts`, in `describe("POST /api/inquiries")`:

```ts
	it("403 BLOCKED, with no notification", async () => {
		mockCreateInquiry.mockResolvedValue({ kind: "blocked" });
		const res = await createRoute(json(validBody));
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "BLOCKED" });
		expect(afterCallbacks).toHaveLength(0);
	});
```

Run: `pnpm exec jest "inquiryWrites|api/inquiries/routes"`. Expected: FAIL.

- [ ] **Step 2: Implement**

In `inquiryWrites.ts`:
- add `| { kind: "blocked" }` to `CreateResult`;
- import `blockersBetween`;
- in `createInquiry`, right after the `own-space` check:

```ts
	// Before open-thread reuse: a blocked renter is never told their message
	// was "added to your existing conversation".
	if ((await blockersBetween(userId, space.host.userId)).length > 0) return { kind: "blocked" };
```

In `app/api/inquiries/route.ts`, add to the switch:

```ts
		case "blocked":
			return error({ error: "BLOCKED" }, 403);
```

- [ ] **Step 3: Run the tests and watch them pass**

Run: `pnpm exec jest "inquiryWrites|api/inquiries/routes"`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/_lib/server/inquiryWrites.ts app/_lib/server/inquiryWrites.test.ts app/api/inquiries/route.ts app/api/inquiries/routes.test.ts
git commit -m "feat(safety): a blocked pair can't start a new inquiry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Thread fixture (`frontend-dev`)

**Files:**
- Modify: `app/_components/testing.tsx` (`demoThread`)

- [ ] **Step 1: Confirm the failure**

Run: `pnpm typecheck`. Expected: one error, `demoThread` is missing `blockedByMe`.

- [ ] **Step 2: Fix the fixture**

In `demoThread`, after `canClose: true,`, add `blockedByMe: false,`.

- [ ] **Step 3: Run checks**

Run: `pnpm typecheck`, `pnpm test` and `pnpm lint`. Expected: all clean. If a `ThreadView` test fails because a mocked poll response lacks `canReply`, stop and report it. 6-3 owns the poller change, so this task doesn't touch `ThreadView`.

- [ ] **Step 4: Commit**

```bash
git add app/_components/testing.tsx
git commit -m "test(inbox): demoThread carries blockedByMe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**PR 6-2a ends here.**

---

### Task 5: Block and unblock

**Files:**
- Create: `app/_lib/server/blocks.ts`, `app/_lib/server/blocks.test.ts`
- Create: `app/api/inquiries/[id]/block/route.ts`
- Create: `app/api/inquiries/safetyRoutes.test.ts`

**Interfaces:**
- Consumes: `getParticipation` (with `hostUserId` and `renterId`) from Task 2.
- Produces:

```ts
export type BlockResult = { kind: "ok"; blockedByMe: boolean } | { kind: "not-found" } | { kind: "not-linked" };
export async function blockCounterpart(inquiryId: string, userId: string): Promise<BlockResult>;
export async function unblockCounterpart(inquiryId: string, userId: string): Promise<BlockResult>;
```

- [ ] **Step 1: Write the failing server tests**

Create `app/_lib/server/blocks.test.ts`:

```ts
/** @jest-environment node */
const mockGetParticipation = jest.fn();
const mockUpsert = jest.fn();
const mockDeleteMany = jest.fn();

jest.mock("@/app/_lib/server/inquiryAccess", () => ({ getParticipation: (...a: unknown[]) => mockGetParticipation(...a) }));
jest.mock("@/app/_lib/db", () => ({
	prisma: { block: { upsert: (...a: unknown[]) => mockUpsert(...a), deleteMany: (...a: unknown[]) => mockDeleteMany(...a) } },
}));

import { blockCounterpart, unblockCounterpart } from "@/app/_lib/server/blocks";

const RENTER = "user_renter";
const HOST = "user_host";
const participation = (role: "RENTER" | "HOST", hostUserId: string | null = HOST) => ({
	id: "inq_1",
	status: "RESPONDED",
	role,
	renterId: RENTER,
	requesterName: "Demo Renter",
	hostDisplayName: "Demo Host A",
	hostUserId,
	canSend: true,
	blockedByMe: false,
});

beforeEach(() => jest.resetAllMocks());

describe("blockCounterpart", () => {
	it("a renter blocks the host's user, idempotently (upsert on the pair)", async () => {
		mockGetParticipation.mockResolvedValue(participation("RENTER"));
		await expect(blockCounterpart("inq_1", RENTER)).resolves.toEqual({ kind: "ok", blockedByMe: true });
		expect(mockUpsert).toHaveBeenCalledWith({
			where: { blockerId_blockedId: { blockerId: RENTER, blockedId: HOST } },
			create: { blockerId: RENTER, blockedId: HOST },
			update: {},
			select: { id: true },
		});
	});

	it("a host blocks the renter", async () => {
		mockGetParticipation.mockResolvedValue(participation("HOST"));
		await blockCounterpart("inq_1", HOST);
		expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: { blockerId: HOST, blockedId: RENTER } }));
	});

	it("not-found for someone outside the thread", async () => {
		mockGetParticipation.mockResolvedValue(null);
		await expect(blockCounterpart("inq_1", "user_other")).resolves.toEqual({ kind: "not-found" });
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	it("not-linked when the host has no user yet; writes nothing", async () => {
		mockGetParticipation.mockResolvedValue(participation("RENTER", null));
		await expect(blockCounterpart("inq_1", RENTER)).resolves.toEqual({ kind: "not-linked" });
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	it("works on a closed thread", async () => {
		mockGetParticipation.mockResolvedValue({ ...participation("RENTER"), status: "CLOSED", canSend: false });
		await expect(blockCounterpart("inq_1", RENTER)).resolves.toEqual({ kind: "ok", blockedByMe: true });
	});
});

describe("unblockCounterpart", () => {
	it("removes only the viewer's own block", async () => {
		mockGetParticipation.mockResolvedValue(participation("RENTER"));
		mockDeleteMany.mockResolvedValue({ count: 1 });
		await expect(unblockCounterpart("inq_1", RENTER)).resolves.toEqual({ kind: "ok", blockedByMe: false });
		expect(mockDeleteMany).toHaveBeenCalledWith({ where: { blockerId: RENTER, blockedId: HOST } });
	});

	it("is idempotent when there was no block", async () => {
		mockGetParticipation.mockResolvedValue(participation("HOST"));
		mockDeleteMany.mockResolvedValue({ count: 0 });
		await expect(unblockCounterpart("inq_1", HOST)).resolves.toEqual({ kind: "ok", blockedByMe: false });
		expect(mockDeleteMany).toHaveBeenCalledWith({ where: { blockerId: HOST, blockedId: RENTER } });
	});

	it("is ok with nothing to delete when the host has no user", async () => {
		mockGetParticipation.mockResolvedValue(participation("RENTER", null));
		await expect(unblockCounterpart("inq_1", RENTER)).resolves.toEqual({ kind: "ok", blockedByMe: false });
		expect(mockDeleteMany).not.toHaveBeenCalled();
	});

	it("not-found for someone outside the thread", async () => {
		mockGetParticipation.mockResolvedValue(null);
		await expect(unblockCounterpart("inq_1", "user_other")).resolves.toEqual({ kind: "not-found" });
	});
});
```

Run: `pnpm exec jest "server/blocks"`. Expected: FAIL, because the module doesn't exist yet.

- [ ] **Step 2: Implement `blocks.ts`**

```ts
// Block and unblock the other side of a thread. Keyed by thread so no one ever
// handles the other user's id. Works on any thread you're in, open or not.
// Unblocking removes only your own block: with blocks both ways, the thread
// stays read-only until both are gone (see canSend in inquiryAccess.ts).

import { prisma } from "@/app/_lib/db";
import { getParticipation, type Participation } from "@/app/_lib/server/inquiryAccess";

export type BlockResult = { kind: "ok"; blockedByMe: boolean } | { kind: "not-found" } | { kind: "not-linked" };

// The host's side has no user until they sign in, so there is no one to block.
const counterpartOf = (p: Participation): string | null => (p.role === "RENTER" ? p.hostUserId : p.renterId);

export async function blockCounterpart(inquiryId: string, userId: string): Promise<BlockResult> {
	const p = await getParticipation(inquiryId, userId);
	if (!p) return { kind: "not-found" };
	const blockedId = counterpartOf(p);
	if (!blockedId) return { kind: "not-linked" };
	await prisma.block.upsert({
		where: { blockerId_blockedId: { blockerId: userId, blockedId } },
		create: { blockerId: userId, blockedId },
		update: {},
		select: { id: true },
	});
	return { kind: "ok", blockedByMe: true };
}

export async function unblockCounterpart(inquiryId: string, userId: string): Promise<BlockResult> {
	const p = await getParticipation(inquiryId, userId);
	if (!p) return { kind: "not-found" };
	const blockedId = counterpartOf(p);
	if (blockedId) await prisma.block.deleteMany({ where: { blockerId: userId, blockedId } });
	return { kind: "ok", blockedByMe: false };
}
```

Check that `Participation` is exported as a type from `inquiryAccess.ts` (it is). If the lint rules reject the inline `type` import, use a separate `import type`.

Run: `pnpm exec jest "server/blocks"`. Expected: PASS.

- [ ] **Step 3: Write the failing route tests**

Create `app/api/inquiries/safetyRoutes.test.ts`:

```ts
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
```

Run: `pnpm exec jest "safetyRoutes"`. Expected: FAIL, because the route doesn't exist yet.

- [ ] **Step 4: Implement the route**

Create `app/api/inquiries/[id]/block/route.ts`:

```ts
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { blockCounterpart, unblockCounterpart, type BlockResult } from "@/app/_lib/server/blocks";
import type { BlockResponse, InquiryApiError } from "@/app/_lib/types";

type Context = { params: Promise<{ id: string }> };
const error = (body: InquiryApiError, status: number) => Response.json(body, { status });

function respond(outcome: BlockResult): Response {
	switch (outcome.kind) {
		case "ok":
			return Response.json({ blockedByMe: outcome.blockedByMe } satisfies BlockResponse);
		case "not-found":
			return error({ error: "NOT_FOUND" }, 404);
		case "not-linked":
			return error({ error: "NOT_LINKED" }, 409);
	}
}

export async function POST(_request: Request, { params }: Context): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);
	const { id } = await params;
	return respond(await blockCounterpart(id, user.id));
}

export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);
	const { id } = await params;
	return respond(await unblockCounterpart(id, user.id));
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm exec jest "server/blocks|safetyRoutes"`, then `pnpm typecheck` and `pnpm lint`. Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/server/blocks.ts app/_lib/server/blocks.test.ts "app/api/inquiries/[id]/block/route.ts" app/api/inquiries/safetyRoutes.test.ts
git commit -m "feat(safety): block and unblock the other side of a thread

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Reports and the ops email

**Files:**
- Create: `app/_lib/reportValidation.ts`, `app/_lib/reportValidation.test.ts`
- Create: `app/_lib/server/reports.ts`, `app/_lib/server/reports.test.ts`
- Create: `app/_lib/server/reportNotify.ts`, `app/_lib/server/reportNotify.test.ts`
- Create: `app/api/inquiries/[id]/report/route.ts`
- Modify: `app/api/inquiries/safetyRoutes.test.ts`

**Interfaces:**
- Consumes: `getParticipation`, `getMailer`, `escapeHtml`, `REPORTS_PER_USER_PER_DAY`, `REPORT_DETAIL_MAX`, `NewReportInput` and `ReportFieldErrors`.
- Produces:

```ts
// app/_lib/reportValidation.ts (pure, shared with 6-3's dialog)
export function validateNewReport(input: unknown): { ok: true; value: NewReportInput } | { ok: false; errors: ReportFieldErrors };
// app/_lib/server/reports.ts
export type ReportResult = { kind: "created"; id: string } | { kind: "not-found" } | { kind: "rate-limited" };
export async function createReport(inquiryId: string, userId: string, input: NewReportInput, now?: Date): Promise<ReportResult>;
// app/_lib/server/reportNotify.ts
export function reportEmail(args: { to: string; reportId: string; inquiryId: string; reason: ReportReason }): MailMessage;
export async function notifyReport(reportId: string, env?: NodeJS.ProcessEnv): Promise<void>;
```

- [ ] **Step 1: Write the failing validator tests**

`app/_lib/reportValidation.test.ts`:

```ts
import { validateNewReport } from "@/app/_lib/reportValidation";

it("accepts a reason with no detail, and trims detail to null when blank", () => {
	expect(validateNewReport({ reason: "SPAM" })).toEqual({ ok: true, value: { reason: "SPAM", detail: null } });
	expect(validateNewReport({ reason: "SPAM", detail: "   " })).toEqual({ ok: true, value: { reason: "SPAM", detail: null } });
	expect(validateNewReport({ reason: "OTHER", detail: "  Asked me to pay outside the app  " })).toEqual({
		ok: true,
		value: { reason: "OTHER", detail: "Asked me to pay outside the app" },
	});
});

it("accepts exactly 1000 characters, counting code points", () => {
	expect(validateNewReport({ reason: "SPAM", detail: "🎬".repeat(1000) }).ok).toBe(true);
});

it.each([
	[{ reason: "WEDDING" }, { reason: "Choose a reason." }],
	[{}, { reason: "Choose a reason." }],
	[{ reason: "SPAM", detail: "x".repeat(1001) }, { detail: "Keep it under 1000 characters." }],
	[{ reason: "SPAM", detail: 42 }, { detail: "Enter text." }],
	[{ reason: "SPAM", detail: "a\u0000b" }, { detail: "Remove unsupported characters." }],
	[{ reason: "SPAM\u0000" }, { reason: "Choose a reason." }],
])("rejects %o", (input, errors) => {
	expect(validateNewReport(input)).toEqual({ ok: false, errors });
});

it("rejects a non-object without throwing", () => {
	expect(validateNewReport(null)).toEqual({ ok: false, errors: { reason: "Choose a reason." } });
	expect(validateNewReport("SPAM")).toEqual({ ok: false, errors: { reason: "Choose a reason." } });
});
```

Run: `pnpm exec jest "reportValidation"`. Expected: FAIL.

- [ ] **Step 2: Implement the validator**

`app/_lib/reportValidation.ts`:

```ts
// Validation for reports. Pure, with no server imports, so the route and the
// report dialog share the same rules.

import { REPORT_DETAIL_MAX } from "@/app/_lib/constants/inquiries";
import { ReportReason } from "@/generated/prisma/enums";
import type { NewReportInput, ReportFieldErrors } from "@/app/_lib/types";

const REASONS: readonly string[] = Object.values(ReportReason);
const isReason = (value: unknown): value is ReportReason => typeof value === "string" && REASONS.includes(value);

export function validateNewReport(
	input: unknown,
): { ok: true; value: NewReportInput } | { ok: false; errors: ReportFieldErrors } {
	const raw: Record<string, unknown> = typeof input === "object" && input !== null ? { ...input } : {};
	const errors: ReportFieldErrors = {};

	const reason = raw.reason;
	if (!isReason(reason)) errors.reason = "Choose a reason.";

	let detail: string | null = null;
	if (raw.detail !== null && raw.detail !== undefined) {
		if (typeof raw.detail !== "string") errors.detail = "Enter text.";
		else if (raw.detail.includes("\u0000")) errors.detail = "Remove unsupported characters.";
		else {
			detail = raw.detail.trim() || null;
			if (detail && [...detail].length > REPORT_DETAIL_MAX) errors.detail = `Keep it under ${REPORT_DETAIL_MAX} characters.`;
		}
	}

	if (!isReason(reason) || Object.keys(errors).length > 0) return { ok: false, errors };
	return { ok: true, value: { reason, detail } };
}
```

Run: `pnpm exec jest "reportValidation"`. Expected: PASS.

- [ ] **Step 3: Write the failing `createReport` tests**

`app/_lib/server/reports.test.ts`:

```ts
/** @jest-environment node */
const mockGetParticipation = jest.fn();
const mockCount = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/app/_lib/server/inquiryAccess", () => ({ getParticipation: (...a: unknown[]) => mockGetParticipation(...a) }));
jest.mock("@/app/_lib/db", () => ({
	prisma: { report: { count: (...a: unknown[]) => mockCount(...a), create: (...a: unknown[]) => mockCreate(...a) } },
}));

import { createReport } from "@/app/_lib/server/reports";

const now = new Date("2026-10-19T10:00:00Z");
const dayAgo = new Date("2026-10-18T10:00:00Z");
const input = { reason: "SCAM_OR_PHISHING" as const, detail: "Asked for a deposit by bank transfer" };

beforeEach(() => {
	jest.resetAllMocks();
	mockGetParticipation.mockResolvedValue({ id: "inq_1", role: "HOST", canSend: false });
	mockCount.mockResolvedValue(0);
	mockCreate.mockResolvedValue({ id: "rep_1" });
});

it("creates a report on any thread the user is in, even a read-only one", async () => {
	await expect(createReport("inq_1", "user_host", input, now)).resolves.toEqual({ kind: "created", id: "rep_1" });
	expect(mockCreate).toHaveBeenCalledWith({
		data: { reporterId: "user_host", inquiryId: "inq_1", reason: "SCAM_OR_PHISHING", detail: "Asked for a deposit by bank transfer" },
		select: { id: true },
	});
});

it("not-found for someone outside the thread", async () => {
	mockGetParticipation.mockResolvedValue(null);
	await expect(createReport("inq_1", "user_other", input, now)).resolves.toEqual({ kind: "not-found" });
	expect(mockCreate).not.toHaveBeenCalled();
});

it("rate-limited at 10 reports in the last 24 hours", async () => {
	mockCount.mockResolvedValue(10);
	await expect(createReport("inq_1", "user_host", input, now)).resolves.toEqual({ kind: "rate-limited" });
	expect(mockCount).toHaveBeenCalledWith({ where: { reporterId: "user_host", createdAt: { gt: dayAgo } } });
	expect(mockCreate).not.toHaveBeenCalled();
});

it("allows the 10th report (9 before it)", async () => {
	mockCount.mockResolvedValue(9);
	await expect(createReport("inq_1", "user_host", input, now)).resolves.toMatchObject({ kind: "created" });
});
```

Run: `pnpm exec jest "server/reports"`. Expected: FAIL.

- [ ] **Step 4: Implement `reports.ts`**

```ts
// Reports on a thread, for a human to review in Prisma Studio. A report never
// blocks, closes or hides anything. Detail is private to ops: never logged.

import { REPORTS_PER_USER_PER_DAY } from "@/app/_lib/constants/inquiries";
import { prisma } from "@/app/_lib/db";
import { getParticipation } from "@/app/_lib/server/inquiryAccess";
import type { NewReportInput } from "@/app/_lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReportResult = { kind: "created"; id: string } | { kind: "not-found" } | { kind: "rate-limited" };

export async function createReport(
	inquiryId: string,
	userId: string,
	input: NewReportInput,
	now: Date = new Date(),
): Promise<ReportResult> {
	if (!(await getParticipation(inquiryId, userId))) return { kind: "not-found" };
	const recent = await prisma.report.count({
		where: { reporterId: userId, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
	});
	if (recent >= REPORTS_PER_USER_PER_DAY) return { kind: "rate-limited" };
	const created = await prisma.report.create({
		data: { reporterId: userId, inquiryId, reason: input.reason, detail: input.detail },
		select: { id: true },
	});
	return { kind: "created", id: created.id };
}
```

Run: `pnpm exec jest "server/reports"`. Expected: PASS.

- [ ] **Step 5: Write the failing ops-email tests**

`app/_lib/server/reportNotify.test.ts`:

```ts
/** @jest-environment node */
const mockFindUnique = jest.fn();
const mockSend = jest.fn();

jest.mock("@/app/_lib/db", () => ({ prisma: { report: { findUnique: (...a: unknown[]) => mockFindUnique(...a) } } }));
jest.mock("@/app/_lib/server/mailer", () => ({ getMailer: () => ({ send: (...a: unknown[]) => mockSend(...a) }) }));

import { notifyReport, reportEmail } from "@/app/_lib/server/reportNotify";

let errorSpy: jest.SpyInstance;
beforeEach(() => {
	jest.resetAllMocks();
	mockFindUnique.mockResolvedValue({ id: "rep_1", inquiryId: "inq_1", reason: "HARASSMENT" });
	mockSend.mockResolvedValue(undefined);
	errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

const env = { REPORTS_EMAIL_TO: "ops@example.invalid" } as unknown as NodeJS.ProcessEnv;

it("builds an email with ids and reason only", () => {
	const msg = reportEmail({ to: "ops@example.invalid", reportId: "rep_1", inquiryId: "inq_1", reason: "HARASSMENT" });
	expect(msg).toEqual({
		to: "ops@example.invalid",
		subject: "Report: HARASSMENT",
		text: "Report rep_1 on inquiry inq_1.\nReason: HARASSMENT\n\nReview in Prisma Studio.",
		html: "<p>Report rep_1 on inquiry inq_1.</p><p>Reason: HARASSMENT</p><p>Review in Prisma Studio.</p>",
	});
});

it("reads only id, inquiryId and reason, never the detail, and sends to REPORTS_EMAIL_TO", async () => {
	await notifyReport("rep_1", env);
	expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: "rep_1" }, select: { id: true, inquiryId: true, reason: true } });
	expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: "ops@example.invalid", subject: "Report: HARASSMENT" }));
});

it("logs the fixed line and sends nothing when REPORTS_EMAIL_TO is unset", async () => {
	await notifyReport("rep_1", {} as NodeJS.ProcessEnv);
	expect(errorSpy).toHaveBeenCalledWith("[report] no REPORTS_EMAIL_TO");
	expect(mockSend).not.toHaveBeenCalled();
});

it("never throws; a send failure logs the report id only", async () => {
	mockSend.mockRejectedValue(new Error("Resend responded 503 for ops@example.invalid"));
	await expect(notifyReport("rep_1", env)).resolves.toBeUndefined();
	expect(errorSpy).toHaveBeenCalledWith("[report] notify failed", { reportId: "rep_1" });
	expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(/example\.invalid/);
});

it("does nothing for an unknown report", async () => {
	mockFindUnique.mockResolvedValue(null);
	await notifyReport("nope", env);
	expect(mockSend).not.toHaveBeenCalled();
});
```

Run: `pnpm exec jest "reportNotify"`. Expected: FAIL.

- [ ] **Step 6: Implement `reportNotify.ts`**

```ts
// Tells ops a report was filed. Runs from after(), so it never delays or fails
// the request. Ids and the reason only: the reporter's detail is read in
// Prisma Studio, never emailed or logged.

import { prisma } from "@/app/_lib/db";
import { escapeHtml } from "@/app/_lib/server/escapeHtml";
import { getMailer, type MailMessage } from "@/app/_lib/server/mailer";
import type { ReportReason } from "@/app/_lib/types";

type Args = { to: string; reportId: string; inquiryId: string; reason: ReportReason };

export function reportEmail({ to, reportId, inquiryId, reason }: Args): MailMessage {
	const lines = [`Report ${reportId} on inquiry ${inquiryId}.`, `Reason: ${reason}`, "Review in Prisma Studio."];
	return {
		to,
		subject: `Report: ${reason}`,
		text: `${lines[0]}\n${lines[1]}\n\n${lines[2]}`,
		html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
	};
}

export async function notifyReport(reportId: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
	try {
		const to = env.REPORTS_EMAIL_TO;
		if (!to) {
			console.error("[report] no REPORTS_EMAIL_TO");
			return;
		}
		const row = await prisma.report.findUnique({ where: { id: reportId }, select: { id: true, inquiryId: true, reason: true } });
		if (!row) return;
		await getMailer().send(reportEmail({ to, reportId: row.id, inquiryId: row.inquiryId, reason: row.reason }));
	} catch {
		console.error("[report] notify failed", { reportId });
	}
}
```

The unset-env test expects the log line before any database read. Order the code as shown.

Run: `pnpm exec jest "reportNotify"`. Expected: PASS.

- [ ] **Step 7: Write the failing report-route tests**

In `app/api/inquiries/safetyRoutes.test.ts`:
- add these mocks at the top:

```ts
const mockCreateReport = jest.fn();
const mockNotifyReport = jest.fn();
const afterCallbacks: Array<() => unknown> = [];
jest.mock("@/app/_lib/server/reports", () => ({ createReport: (...a: unknown[]) => mockCreateReport(...a) }));
jest.mock("@/app/_lib/server/reportNotify", () => ({ notifyReport: (...a: unknown[]) => mockNotifyReport(...a) }));
jest.mock("next/server", () => ({ after: (cb: () => unknown) => afterCallbacks.push(cb) }));
```

- import `POST as reportRoute` from `@/app/api/inquiries/[id]/report/route`;
- add `afterCallbacks.length = 0;` to `beforeEach`;
- add:

```ts
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
```

Run: `pnpm exec jest "safetyRoutes"`. Expected: the report cases FAIL.

- [ ] **Step 8: Implement the route**

`app/api/inquiries/[id]/report/route.ts`:

```ts
import { after } from "next/server";
import { validateNewReport } from "@/app/_lib/reportValidation";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { notifyReport } from "@/app/_lib/server/reportNotify";
import { createReport } from "@/app/_lib/server/reports";
import type { CreateReportResponse, ReportApiError } from "@/app/_lib/types";

type Context = { params: Promise<{ id: string }> };
const error = (body: ReportApiError, status: number) => Response.json(body, { status });

export async function POST(request: Request, { params }: Context): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);
	const { id } = await params;

	const body: unknown = await request.json().catch(() => null);
	const result = validateNewReport(body);
	if (!result.ok) return error({ error: "VALIDATION", fields: result.errors }, 400);

	const outcome = await createReport(id, user.id, result.value);
	switch (outcome.kind) {
		case "created":
			after(() => notifyReport(outcome.id));
			return Response.json({ id: outcome.id } satisfies CreateReportResponse, { status: 201 });
		case "not-found":
			return error({ error: "NOT_FOUND" }, 404);
		case "rate-limited":
			return error({ error: "RATE_LIMITED" }, 429);
	}
}
```

Malformed JSON parses to `null`, so `validateNewReport(null)` returns `{ reason: "Choose a reason." }`. The malformed-JSON test only checks `error: "VALIDATION"`.

- [ ] **Step 9: Full checks**

Run: `pnpm test`, `pnpm typecheck` and `pnpm lint`. Then run `pnpm build` with `BETTER_AUTH_SECRET=throwaway-dev-secret-0123456789abcdef BETTER_AUTH_URL=http://localhost:3000`.
Expected: all clean. Also run `grep -rn "detail" app/_lib/server/reportNotify.ts app/_lib/server/reports.ts`. Expected: the only hits are comments, the `create` data and the `NewReportInput` field. No `console.*` line mentions `detail`.

- [ ] **Step 10: Commit**

```bash
git add app/_lib/reportValidation.ts app/_lib/reportValidation.test.ts app/_lib/server/reports.ts app/_lib/server/reports.test.ts app/_lib/server/reportNotify.ts app/_lib/server/reportNotify.test.ts "app/api/inquiries/[id]/report/route.ts" app/api/inquiries/safetyRoutes.test.ts
git commit -m "feat(safety): report a conversation; ops is emailed ids and reason only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**PR 6-2b ends here.** Before the PR goes out, the main session adds `REPORTS_EMAIL_TO` to the README's environment section (not `.env*`).
