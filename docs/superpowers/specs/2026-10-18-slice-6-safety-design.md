# Slice 6 — Safety: blocking, reporting, safe emails

Status: design approved in the main session, 2026-10-18. Awaiting spec review.
Builds on slice 5b (inquiries and threads): `getParticipation`, the inquiry
routes, `notifyCounterpart`, `ThreadView` and its poller.

## What this slice does

The launch blockers carried forward from the 5b spec:

- Either side of a thread can **block** the other. Blocked pairs can't message
  each other or start new inquiries.
- Either side can **report** a conversation. A human reviews it; nothing happens
  automatically.
- Notification emails from the Iskawt domain carry **no user-typed text**, and
  `requesterName` can't impersonate Iskawt.
- A host whose `verifiedAt` is removed can no longer message anyone.

## Decisions

| Question | Decision |
| --- | --- |
| How a report reaches a human | A `Report` row, plus an email to a fixed ops address (`REPORTS_EMAIL_TO`). Reviewed in Prisma Studio, like `HostApplication`. No admin view. |
| Is a block visible? | Neutral. The blocked side sees the existing "This conversation is closed." and, on a new inquiry, "You can't send inquiries to this host." Nothing ever says "blocked" to them. |
| Block scope | User to user, not per thread. A host's block covers every space they host. |
| Emails | No typed text at all: no sender name, no message body. Space title (human-reviewed) and a link only. |
| Name filter | `requesterName` rejects reserved words (after lookalike normalising), URLs, emails and `@`. Applies everywhere the name is shown. |
| Unverified host | Threads become read-only for both sides. The host can still read them. Re-verifying restores messaging in threads that are still open. |
| How the rules are enforced | Computed at read time in `getParticipation`. No thread status is rewritten, so unblock and re-verify undo cleanly. |
| Per-message reports | Dropped. Reports are per conversation; ops reads the whole thread. |
| Delivery | Three PRs: **6-1** names and emails, **6-2** blocks and reports API, **6-3** thread UI. |

## Data model (schema change and migration, agreed as part of the contract)

```prisma
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

enum ReportReason {
  SPAM
  SCAM_OR_PHISHING
  HARASSMENT
  NOT_THEIR_SPACE
  OTHER
}
```

`User` gains `blocksMade`, `blocksReceived` and `reports`; `Inquiry` gains
`reports`. Nothing else changes. Unblocking deletes the `Block` row.

## Contract — changes to `app/_lib/types.ts`

```ts
export type InquiryThread = {
	// ...unchanged fields...
	canReply: boolean; // false while closed, blocked either way, or the host is unverified
	canDecline: boolean; // same conditions, plus host only
	canClose: boolean; // same conditions
	blockedByMe: boolean; // drives "You blocked {name}." and Unblock
};

// GET /api/inquiries/[id]/messages — 200
export type MessagesResponse = { messages: InquiryMessage[]; status: InquiryStatus; canReply: boolean };

export type ReportReason = "SPAM" | "SCAM_OR_PHISHING" | "HARASSMENT" | "NOT_THEIR_SPACE" | "OTHER";

// POST /api/inquiries/[id]/report
export type NewReportInput = { reason: ReportReason; detail: string | null };
export type ReportFieldErrors = Partial<Record<keyof NewReportInput, string>>;
export type CreateReportResponse = { id: string }; // 201

// POST and DELETE /api/inquiries/[id]/block — 200
export type BlockResponse = { blockedByMe: boolean };

export type InquiryApiError = {
	error:
		| "UNAUTHENTICATED" | "VALIDATION" | "OWN_SPACE" | "NOT_FOUND" | "RATE_LIMITED"
		| "THREAD_CLOSED" | "NOT_HOST"
		| "BLOCKED"; // new: POST /api/inquiries only
	fields?: InquiryFieldErrors | ReportFieldErrors;
};
```

`InquiryStatus` and `InquirySummary` are unchanged. The inbox shows the real
status; only the thread page shows the read-only state. Nothing tells a user that
the *other* side blocked them: there is no `blockedByThem`.

`ReportReason` is re-exported from the generated client like the other enums,
and `inquiryLabels`-style display names go in `app/_lib/constants/labels.ts`.

## Access rules

`getParticipation` additionally loads, in the same query:

- whether a `Block` exists between the renter and the host's user, in either
  direction, and whether this viewer made one;
- the space's `host.verifiedAt`.

It returns `canSend = isOpen(status) && !blockedEitherWay && hostVerified` and
`blockedByMe`. Who may **read** a thread doesn't change: participation is still
`renterId` or `host.userId`, regardless of verification or blocks.

- Reply, decline and close return 409 `THREAD_CLOSED` when `!canSend`. The
  write-time recheck in `inquiryWrites.ts` stays.
- Report and block work on any thread you're in, open or not.
- Unblock removes only the viewer's own block. With blocks both ways, the
  thread stays read-only until both are removed.
- `POST /api/inquiries` returns 403 `BLOCKED` when a block exists either way
  between the renter and the space's host user. This is checked **before**
  open-thread reuse, so a blocked renter never sees "Added to your existing
  conversation".
- Check in 6-2, not assumed: the host's inbox list and the thread page find
  threads through `Host.userId` and don't filter on verification. `CurrentUser.host`
  is null for an unverified host, so no page may use it to grant thread access.

## API (route handlers, `backend-dev`)

Every route is keyed by thread id, so no one ever handles the other user's id.
A non-participant gets 404, as on every inquiry route.

| Route | Body | Result |
| --- | --- | --- |
| `POST /api/inquiries/[id]/report` | `NewReportInput` | 201 `CreateReportResponse`; 400 `VALIDATION`; 429 `RATE_LIMITED` past `REPORTS_PER_USER_PER_DAY` (10) |
| `POST /api/inquiries/[id]/block` | none | 200 `{ blockedByMe: true }`, idempotent |
| `DELETE /api/inquiries/[id]/block` | none | 200 `{ blockedByMe: false }`, idempotent |

A report never blocks, closes or hides anything. The UI's "Also block" checkbox
makes a separate block call.

**Ops notification.** From `after()`, so it never delays or fails the request.

- To `REPORTS_EMAIL_TO`. If unset, the report is still saved and a fixed line is
  logged: `[report] no REPORTS_EMAIL_TO`. In development, the `ConsoleMailer`.
- Subject `Report: {REASON}`. Text: report id, inquiry id, reason, and "Review in
  Prisma Studio." Never the detail, a message body, a name or an email.
- Log lines carry ids only. Never `detail`.

## Names and emails (`backend-dev`)

**Name filter**, in `app/_lib/inquiryValidation.ts`, shared by the form and the API:

- Normalise: lowercase, strip accents (NFKD, drop combining marks), map lookalikes
  (`1`/`l`/`!` → `i`, `0` → `o`, `@` → `a`, `$` → `s`, `3` → `e`). Then split into
  words on anything that isn't a letter.
- Reject if:
  - a **brand word** appears anywhere in the words joined together, so
    "i-s-k-a-w-t" and "IskawtPH" are caught;
  - a **role word** equals one whole word, so "Team Iskawt" and "Admin" are caught
    but "Steam Films" and "Teamwork Studio" are not;
  - the raw name contains a URL (`http`, `www.`, or `word.tld` with no space after
    the dot), an email address, or `@`.
- In a new `app/_lib/constants/reservedNames.ts`: brand words `iskawt`, `scout`;
  role words `support`, `admin`, `staff`, `team`, `official`, `moderator`.
- Error: "Use your own name or your production's name."
- Existing rows aren't re-checked.

**Notification email** (`inquiryEmail.ts`). `senderName` and `body` are removed
from its arguments; `notifyCounterpart` stops passing them. It is the only
notification path (both `POST /api/inquiries` and replies use it).

- Subject: `New message about {space title}`.
- Text: `You have a new message about {space title}.` then the existing CTA line
  (`Reply on Iskawt: {url}`, or the not-yet-linked host's sign-in wording), then
  `Iskawt never asks for passwords or payment, by email or in messages.` and the
  existing no-reply footer.
- `notifyCounterpart` sends nothing when the thread can't take messages. In
  practice the send already failed, but this covers a block made between the save
  and `after()`.

## Pages (`frontend-dev`)

**`ThreadView`:**

- A "More" button (MUI `Menu`, 44px) in the thread header: "Report conversation",
  and "Block {name}" or "Unblock {name}".
- **Report dialog** (MUI `Dialog`, focus trapped, Escape closes): reason radios
  with labels from `labels.ts`, optional detail with a 1000-character counter, an
  "Also block {name}" checkbox, and Submit. On success: "Thanks. Someone from
  Iskawt will look at this." No outcome is promised. Errors show inline; a 429
  says "You've sent a lot of reports today. Try again tomorrow."
- **Block** confirms in the page, never `window.confirm`: "Block {name}? Neither
  of you will be able to send messages in your conversations, and they won't be
  able to send you new inquiries. They won't be told."
- **Read-only states**, where the reply box was:
  - `blockedByMe`: "You blocked {name}." and an Unblock button;
  - otherwise, `!canReply`: the existing "This conversation is closed."
- The poller turns the view read-only when a poll returns `canReply: false`, the
  way it handles a status change now. A poll returning `canReply: true` again
  (re-verify, or the other side unblocks) restores the reply box.

**Inquiry panel** on the listing page: on `BLOCKED`, "You can't send inquiries to
this host." Name errors come through the existing per-field display.

## Testing

- **The rule:** a table test of `getParticipation`: open or closed × no block,
  blocked by me, blocked by them, both × host verified or not. Read access is the
  same in every row.
- **Routes:**
  - report: 404 for a non-participant, validation, the daily limit, the ops email's
    content (no detail), nothing private in logs, unset `REPORTS_EMAIL_TO`;
  - block and unblock: idempotent; unblock removes only your own block;
  - `POST /api/inquiries`: `BLOCKED` both directions, checked before reuse;
  - reply, decline and close: 409 when blocked either way or the host is
    unverified; `MessagesResponse.canReply` false in the same cases.
- **Name filter:** rejects "Iskawt Support", "1skawt", "ÍSKAWT", "Team Iskawt",
  "Admin", "i-s-k-a-w-t", "IskawtPH", "visit www.example.com", "example.com",
  "a@b.co". Accepts "Ana Reyes", "Reyes Films", "Ma. Teresa", "Studio Uno",
  "Steam Films", "Teamwork Studio".
- **Email:** neither the sender's name nor the body appears in subject, text or
  HTML; the safety line does.
- **UI:** the report dialog flow and errors, the block confirmation, unblock, a
  poll that flips to read-only and back, the `BLOCKED` copy.

## Out of scope

- An admin view, or any automatic action on a report.
- Per-message reports.
- Telling a user they were blocked, or listing who you've blocked outside threads.
- Blocking by email, device or IP. A blocked user with a new account isn't caught.
- Re-checking existing `requesterName` values.

## Size and delivery

Each PR gets its own fresh `reviewer` pass before merge.

- **6-1, names and emails** (`backend-dev`): the name filter and its constants and
  tests; text-free `inquiryEmail.ts` and the `notifyCounterpart` call. No schema
  change, no contract change.
- **6-2, blocks and reports API** (`backend-dev`): schema and migration, the type
  changes above, the rule in `getParticipation`, the report and block routes, the
  `BLOCKED` check, the ops email, and their tests.
- **6-3, thread UI** (`frontend-dev`): the menu, the report dialog, the block
  confirmation and read-only states, the poller change, the `BLOCKED` copy.

6-3 depends on 6-2's contract; it can start against fixtures once 6-2's types are
committed.
