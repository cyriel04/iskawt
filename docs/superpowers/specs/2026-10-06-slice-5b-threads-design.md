# Slice 5b — Inquiries and threads

Status: design approved in the main session, 2026-10-06. Awaiting spec review.
Builds on slice 5a (accounts): Better Auth magic-link sign-in, `CurrentUser`,
`Host.userId` auto-linking, the `Mailer`.

## What this slice does

A signed-in renter sends an inquiry about a published space. The host and renter
then message each other inside Iskawt. Each side is emailed when the other writes.
Neither side ever sees the other's email address or phone number from the app.

## Decisions

| Question | Decision |
| --- | --- |
| When the renter signs in | **Before** writing the inquiry. Signed-out visitors see "Sign in to send an inquiry". The magic link returns them to the same listing. |
| New-message email | Sender's display name, space title, message text, and a "Reply on Iskawt" link. The sender address is no-reply, and replying to the email reaches nobody. It never contains anyone's email or phone. |
| Host not linked yet | Email `Host.contactEmail`: "You have an inquiry. Sign in with this email to read and reply." Signing in links them (5a) and the thread is waiting. |
| Live updates | The open thread page polls every 15 s, only while the tab is visible. No websockets, no new dependency. |
| Email throttling | At most one notification per side per thread per 10 minutes, and only while that side has unread messages. |
| `Inquiry.internalNote` | Dropped. |
| Delivery | Three PRs: **5b-1** data and API, **5b-2** inquiry form and notifications, **5b-3** inbox and thread pages. |

## Data model (schema change and migration, agreed as part of the contract)

`Inquiry` becomes the conversation. The table has no rows in seed or in any
deployed database (nothing is deployed before slice 6), so it is reshaped in place.

```prisma
model Inquiry {
  id      String @id @default(cuid())
  spaceId String
  space   Space  @relation(fields: [spaceId], references: [id], onDelete: Cascade)

  renterId String
  renter   User   @relation(fields: [renterId], references: [id], onDelete: Cascade)

  // What the host sees about the renter. Typed on the form, because
  // Better Auth stores an empty User.name for magic-link sign-ups.
  requesterName    String
  requesterCompany String?

  shootDate      DateTime? @db.Date
  durationHours  Int?
  crewSize       Int?
  productionType ProductionType @default(FILM)
  budgetNote     String?        @db.Text

  status InquiryStatus @default(NEW)

  lastMessageAt    DateTime  @default(now()) // inbox ordering
  hostLastReadAt   DateTime?
  renterLastReadAt DateTime?
  hostNotifiedAt   DateTime? // email throttle, per side
  renterNotifiedAt DateTime?

  messages Message[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([spaceId, renterId, status])
  @@index([renterId, lastMessageAt])
  @@index([status, createdAt])
}

model Message {
  id        String  @id @default(cuid())
  inquiryId String
  inquiry   Inquiry @relation(fields: [inquiryId], references: [id], onDelete: Cascade)
  senderId  String
  sender    User    @relation(fields: [senderId], references: [id], onDelete: Cascade)
  body      String  @db.Text // 1–4000 characters, trimmed
  createdAt DateTime @default(now())

  @@index([inquiryId, createdAt])
  @@index([senderId, createdAt])
}

enum InquiryStatus {
  NEW        // waiting for the host's first reply
  RESPONDED  // the host has replied at least once
  DECLINED   // the host declined; read-only
  CLOSED     // either side closed it; read-only
}
```

- **Removed from `Inquiry`:** `requesterEmail`, `requesterPhone`, `message` (it becomes the first `Message`), `sentAt`, `respondedAt`, `internalNote`.
- **Removed from the enum:** `SENT`.
- **On `User`:** add the back-relations `inquiries Inquiry[]` and `messages Message[]`.
- **One open thread per renter per space.** "Open" means `NEW` or `RESPONDED`. This is enforced in code inside a transaction, because Prisma has no partial unique index.

## Contract — additions to `app/_lib/types.ts`

```ts
export type { InquiryStatus } from "@/generated/prisma/enums";

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
	counterpartName: string; // the other side's name, as above
	lastMessage: { body: string; sentAt: string; fromMe: boolean }; // body cut to 140 chars
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
	shootDate: string | null;
	durationHours: number | null;
	crewSize: number | null;
	productionType: ProductionType;
	budgetNote: string | null;
	messages: InquiryMessage[]; // oldest first
	canReply: boolean; // status is NEW or RESPONDED
	canDecline: boolean; // role is HOST and status is NEW or RESPONDED
	canClose: boolean; // status is NEW or RESPONDED
};
```

**Constants:** new file `app/_lib/constants/inquiries.ts`.

```ts
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

`crewSize` reuses the existing `CREW_MAX` from `limits.ts`.

**Validation.** It lives in one pure module, `app/_lib/inquiryValidation.ts`, shared by the route handler and the form:

```ts
validateNewInquiry(input: unknown, today: string): { ok: true; value: NewInquiryInput } | { ok: false; errors: Partial<Record<keyof NewInquiryInput, string>> }
validateMessageBody(body: unknown): { ok: true; value: string } | { ok: false; error: string }
```

The rules:

- **Text fields.**
  - `requesterName` and `message` are required.
  - Every string is trimmed.
  - Each length cap above applies.
- **`shootDate`.** It is optional. When given, it must be a real date from `today` (Manila) through today + 365 days.
- **`durationHours`.** It is an integer from 1 to 24.
- **`crewSize`.** It is an integer from 1 to `CREW_MAX`.
- **`productionType`.** It must be a valid enum value.
- **`website`.** It must be empty. A filled spam trap gets a 200 with a fake success: it creates nothing and sends nothing.

## Access rules

- **Participants:** a thread is visible only to its renter (`Inquiry.renterId`) and to the user linked to the space's host (`Space.host.userId`). Everyone else gets **404**, never 403, and an anonymous request gets 401. Existence is never revealed.
- **What each side sees:**
  - The renter sees the host's `displayName`.
  - The host sees the inquiry's `requesterName` and `requesterCompany`.
  - Neither sees `User.email`, `Host.contactEmail`, `Host.contactPhone` or `Space.exactAddress`. Every query uses an explicit `select`.
- **Who may inquire:** only signed-in users, only about a `PUBLISHED` space whose host is verified. A host's own space is refused (400 `OWN_SPACE`).
- **Status changes:**
  - Only the host can **decline**. Either side can **close**.
  - A declined or closed thread rejects new messages (409 `THREAD_CLOSED`).
  - The host's first message moves the status from `NEW` to `RESPONDED`.
- **Read tracking:** opening a thread sets that side's `*LastReadAt`. `unread` is true when `lastMessageAt` is later than that, and the latest message isn't from you.

## API (route handlers, `backend-dev`)

Every handler reads the session through `getCurrentUser()`. Errors are
`{ error: CODE, fields?: {...} }`.

| Route | Does | Responses |
| --- | --- | --- |
| `POST /api/inquiries` | Validate, rate-limit, check access, then in one transaction either find the open thread for (renter, space) and append the message, or create the `Inquiry` plus its first `Message`. Then notify. | 201 `{ id }` new · 200 `{ id, reused: true }` · 400 `VALIDATION`/`OWN_SPACE` · 401 · 404 space · 429 `RATE_LIMITED` |
| `POST /api/inquiries/[id]/messages` | Validate the body, check participant, check open, rate-limit, append, update `lastMessageAt` and status, notify. | 201 `{ message: InquiryMessage }` · 400 · 401 · 404 · 409 `THREAD_CLOSED` · 429 |
| `GET /api/inquiries/[id]/messages?after=<messageId>` | Messages newer than `after` (all if absent), oldest first, and the current status. Marks read. | 200 `{ messages: InquiryMessage[], status }` · 401 · 404 |
| `POST /api/inquiries/[id]/status` | Body `{ action: "decline" \| "close" }`. | 200 `{ status }` · 400 · 401 · 404 · 409 already closed |

**Rate limits.** These are counted from existing rows, so there is no new table:

- inquiries created by the user in the last 24 h ≥ 10 → 429;
- messages sent by the user in the last hour ≥ 60 → 429.

**Server reads** in `app/_lib/server/inquiries.ts`:

- `listInquiriesForUser(userId): Promise<InquirySummary[]>`, newest `lastMessageAt` first;
- `getInquiryThread(id, userId): Promise<InquiryThread | null>`, which also marks the thread read for that side.

## Notifications (`backend-dev`)

`app/_lib/server/inquiryNotify.ts`, called after a message is committed:

- **Recipient:** the other side.
  - For the host: the linked `User.email`. If the host isn't linked yet, `Host.contactEmail` with the "sign in with this email" wording.
  - For the renter: `User.email`.
- **Throttle:** skip if that side's `*NotifiedAt` is within 10 minutes. Otherwise send, then set it.
- **Email:**
  - Subject: `New message about <space title>`.
  - Body: sender display name, space title, message text, and the link `${BETTER_AUTH_URL}/inbox/<id>`.
  - All interpolated text is HTML-escaped (`magicLinkEmail.ts` already has the pattern).
  - It never contains either side's email address or phone number.
- **Failure:**
  - A send failure never fails the request: the message is already saved.
  - It logs `[inquiry] notify failed` with the inquiry id only.
  - `*NotifiedAt` is not set, so the next message retries.

## Pages (`frontend-dev`)

- **`/spaces/[slug]`, inquiry panel**
  - **Signed out:** a "Sign in to send an inquiry" link to `/sign-in?next=/spaces/<slug>`. `/sign-in` must honour `next` as the magic link's `callbackURL`, and only for same-site paths starting with `/` (not `//`).
  - **The host viewing their own space:** "This is your listing" and a link to `/inbox`.
  - **Otherwise:** `InquiryForm`. It is a client component that validates with `validateNewInquiry` before posting.
    - **States:** idle, sending, success, error.
    - **Success:** "Sent. <Host> usually replies within <respondsInHours> hours. We'll email you when they do", with a link to the thread. A reused thread says "Added to your existing conversation".
    - **Errors:** server field errors are shown per field; 429 has its own message.
    - **Spam trap:** the `website` field is visually hidden and `aria-hidden`, with `tabIndex={-1}` and `autoComplete="off"`.
- **`/inbox`** (signed in; otherwise redirect to `/sign-in?next=/inbox`)
  - **Each row:** space title, counterpart name, role ("You asked" / "Your listing"), last message preview, unread dot, and a status chip.
  - **Empty state:** "No conversations yet", with a link to browse.
- **`/inbox/[id]`** (`notFound()` for null)
  - **Layout:** an inquiry summary (date, duration, crew, production type, budget note, plus the requester company for the host), then the messages, then a reply box.
  - **Polling:** `ThreadPoller` is a client component that calls `GET …/messages?after=` every 15 s while `document.visibilityState === "visible"`. It stops on unmount and when hidden, and appends new messages.
  - **Reply box:**
    - It has its own sending and error states.
    - After a successful send, it appends the returned message.
    - On a closed or declined thread it is replaced by "This conversation is closed".
  - **Buttons:** Decline (host only) and Close. Each asks for in-page confirmation, never `window.confirm`.
- **Header:** add an "Inbox" link when signed in. An unread count is **out of scope**; it would be a query on every page.
- **Shared:** loading, empty and error states on each new route, styled with SCSS modules and tokens. Touch targets are at least 44px, and every input is labelled.

## Testing

**Backend:**
- **Access:**
  - Each route returns 401 when signed out.
  - A non-participant gets 404 for all three thread routes.
  - A host inquiring about their own space gets 400.
  - An unpublished or unverified space gets 404.
- **Reuse and status:**
  - A second inquiry reuses the open thread.
  - Once that thread is declined or closed, a new inquiry creates a new thread.
  - The host's first reply sets `RESPONDED`.
  - Messages sent to a closed thread get 409.
  - Only the host can decline.
- **Limits:**
  - The 11th inquiry in a day and the 61st message in an hour get 429.
  - A filled spam trap gets a fake success and no rows.
- **Privacy:** a key scan of every returned shape finds no `email`, `contactEmail`, `contactPhone`, `exactAddress` or `renterId`.
- **Notifications:**
  - The throttle window works, and the unlinked-host wording goes to `contactEmail`.
  - A send failure is swallowed and the error log has no email.
  - Message text is HTML-escaped in the email.
- **Validation:** every rule in `validateNewInquiry` and `validateMessageBody`, including date edges in Manila time.

**Frontend:**
- **Inquiry panel:** its three variants (signed out, own listing, form).
- **Inquiry form:** its states, client validation matching the server, the hidden spam trap, and the reused-thread success.
- **Inbox:** empty, unread and closed rows.
- **Thread page:**
  - The read-only state.
  - Reply errors.
  - The poller's fake timers: it polls while visible, stops when hidden, and appends new messages without duplicates.
- **Sign-in:** `next` is honoured for `/spaces/x` and rejected for `//evil.example` and `https://evil.example`.

## Out of scope

- Attachments or photos in messages.
- Read receipts shown to the other side.
- Typing indicators.
- Websockets.
- An unread badge in the header.
- Message editing or deletion.
- Blocking and reporting. These are needed before public launch; noted for slice 6.
- Admin views.
- Payments, availability.

## Size and delivery

- **5b-1, data and API** (`backend-dev`): the schema and migration, `inquiryValidation.ts` and its tests, `inquiries.ts` server reads, the four routes, and their tests.
- **5b-2, inquiry form and notifications:**
  - `inquiryNotify.ts` and its tests (`backend-dev`);
  - the inquiry panel and form on the listing page, plus `next` support on `/sign-in` (`frontend-dev`).
- **5b-3, inbox and thread pages** (`frontend-dev`): `/inbox`, `/inbox/[id]`, `ThreadPoller`, the reply box and status buttons, and the header Inbox link.

Each PR gets its own fresh `reviewer` pass before merge.
