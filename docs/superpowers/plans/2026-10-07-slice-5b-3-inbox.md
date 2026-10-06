# Slice 5b-3 — Inbox and Thread Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** This is the last part of slice 5. A signed-in user gets:
- `/inbox`: every thread they're in, newest first, with unread dots and status;
- `/inbox/[id]`: one thread, with new messages appearing every 15 s while the tab is visible, a reply box, and Decline (host only) and Close;
- an "Inbox" link in the header.

**Architecture:**
- **Pages:** both are server components. They read the session, redirect to `/sign-in?next=…` when signed out, and call the 5b-1 server reads.
- **Client component:** one, `ThreadView`. It owns the live part of a thread: the message list, the poller, the reply box and the status actions.
- **Pure helpers** in `app/_components/threadMessages.ts` merge, dedupe and order messages, and pick a poll cursor with a 5 s overlap. This is the 5b-1 review's guard against messages that commit out of order.
- **No `loading.tsx` above `/inbox/[id]`.** It calls `notFound()`, and a loading state above it would turn its 404 into a 200 (CLAUDE.md). The list's loading state sits in a route group, `app/inbox/(list)/`.

**Tech Stack:** Next.js 16.3.8 App Router, MUI 9 + SCSS modules, Jest 30 + React Testing Library, and the 5b-1 API: `GET`/`POST /api/inquiries/[id]/messages`, `POST /api/inquiries/[id]/status`.

**Spec:** `docs/superpowers/specs/2026-10-06-slice-5b-threads-design.md`, especially **Pages**, **Access rules** and **Carried forward from the 5b-1 review** (poller overlap and dedupe; `prefetch={false}`; inbox capped at 50). Also `CLAUDE.md`: Styling, Toolchain gotchas (`loading.tsx` and `notFound`; error boundaries get `retry`) and Conventions.

## Global Constraints

- **Ownership.**
  - Every task goes to `frontend-dev`.
  - No backend file changes. The server reads and API exist from 5b-1.
  - `app/_lib/types.ts` doesn't change.
  - Adding `inquiryStatusLabels` to `app/_lib/constants/labels.ts` is an allowed addition.
- **Commits.**
  - Commit locally on `feat/slice-5b-3-inbox` at each commit step, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - If you judge the user's global rule forbids that, leave the work uncommitted and list the files per task. The main session commits.
  - Never push or rebase.
- **Off limits:** new dependencies, `prisma/**`, lockfiles and `.env*`.
- **Privacy.**
  - The pages render only what `InquirySummary` and `InquiryThread` carry: names, never an email.
  - Never log a message body.
- **Inbox links.** Every link to `/inbox/[id]` uses `prefetch={false}`. Opening a thread marks it read, so a prefetch must not.
- **The poller:**
  - polls every `THREAD_POLL_SECONDS` while `document.visibilityState === "visible"`;
  - pauses when the tab is hidden and polls once right away when it becomes visible again;
  - stops on unmount and on 401 or 404;
  - asks with a cursor 5 s behind the newest message, and dedupes by id.
- **No `window.confirm`.** Decline and Close confirm inside the page.
- **Styling.**
  - SCSS modules and tokens only. No `sx`, `styled()` or `style={{}}`.
  - Touch targets at least 44px, labelled inputs, semantic lists.
  - `"use client"` only on `ThreadView`.
- **Times** are shown in Asia/Manila with a fixed formatter, so server and client render the same text.
- **TypeScript strict.** No `any`, no `@ts-ignore`, no non-null `!`.
- **Tests come first.** Watch each new test fail before implementing.
- **Commands.**
  - One file: `pnpm exec jest "<path regex>"`. Bracketed paths need regex, e.g. `"app/inbox/.id./page.test.tsx"`.
  - Then `pnpm typecheck`, `pnpm lint`, and `pnpm build` with `BETTER_AUTH_SECRET=throwaway-dev-secret-0123456789abcdef BETTER_AUTH_URL=http://localhost:3000`.

## Review Focus

1. **A message that commits out of order.** B is visible before an earlier-timestamped A. A still appears on a later poll thanks to the 5 s overlap, B isn't duplicated, and order is by `sentAt`, then `id`.
   - Test: Task 1.
2. **The other side closes or declines while the thread is open.** The next poll returns the new status, the reply box is replaced by "This conversation is closed.", and Decline and Close disappear.
   - Test: Task 3.
3. **A reply sent just as the thread is closed (409).** The reply box shows "This conversation was closed." and the view becomes read-only. The typed text isn't silently lost: it stays visible in the disabled box.
   - Test: Task 3.
4. **The tab is hidden for an hour.** No requests while hidden, then one poll as soon as it's visible again.
   - Test: Task 3.
5. **The session expires on the thread page.** A 401 from a poll or a send stops polling and shows "Your session ended." with a sign-in link back to this thread.
   - Test: Task 3.

---

### Task 1: Pure helpers and status labels

**Files:**
- Create: `app/_components/threadMessages.ts`, `app/_components/threadMessages.test.ts`
- Modify: `app/_lib/constants/labels.ts` (add `inquiryStatusLabels`), `app/_components/labels.test.ts` if it checks label coverage

**Interfaces:**
- **Produces:**
  - `mergeMessages(existing: InquiryMessage[], incoming: InquiryMessage[]): InquiryMessage[]`
  - `pollCursor(messages: InquiryMessage[], overlapSeconds?: number): string | null`
  - `formatSentAt(iso: string): string`, e.g. `"7 Oct, 6:00 PM"` in Asia/Manila
  - `isOpenStatus(status: InquiryStatus): boolean`
  - `inquiryStatusLabels: Record<InquiryStatus, string>`

- [ ] **Step 1: Write the failing test** `app/_components/threadMessages.test.ts`

```ts
import { formatSentAt, isOpenStatus, mergeMessages, pollCursor } from "@/app/_components/threadMessages";
import { inquiryStatusLabels } from "@/app/_lib/constants/labels";
import type { InquiryMessage } from "@/app/_lib/types";

const m = (id: string, sentAt: string, body = id): InquiryMessage => ({
	id,
	body,
	sentAt,
	fromMe: false,
	senderName: "Demo Host A",
});

describe("mergeMessages", () => {
	it("appends new messages, dedupes by id, and orders by sentAt then id", () => {
		const existing = [m("a", "2026-10-07T10:00:00.000Z"), m("c", "2026-10-07T10:00:05.000Z")];
		const incoming = [m("c", "2026-10-07T10:00:05.000Z", "c again"), m("b", "2026-10-07T10:00:03.000Z"), m("d", "2026-10-07T10:00:05.000Z")];
		expect(mergeMessages(existing, incoming).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
	});

	it("keeps the existing copy of a duplicate", () => {
		const merged = mergeMessages([m("a", "2026-10-07T10:00:00.000Z", "first")], [m("a", "2026-10-07T10:00:00.000Z", "second")]);
		expect(merged).toHaveLength(1);
		expect(merged[0].body).toBe("first");
	});

	it("returns the same array when nothing is new (no re-render churn)", () => {
		const existing = [m("a", "2026-10-07T10:00:00.000Z")];
		expect(mergeMessages(existing, [m("a", "2026-10-07T10:00:00.000Z")])).toBe(existing);
	});
});

describe("pollCursor", () => {
	it("is null for an empty thread", () => {
		expect(pollCursor([])).toBeNull();
	});

	it("is the newest message at least 5 s older than the newest one", () => {
		const msgs = [
			m("a", "2026-10-07T10:00:00.000Z"),
			m("b", "2026-10-07T10:00:04.000Z"),
			m("c", "2026-10-07T10:00:06.000Z"),
			m("d", "2026-10-07T10:00:10.000Z"),
		];
		expect(pollCursor(msgs)).toBe("b"); // 10.000 − 5 s = 05.000 → newest at or before is b (04.000)
	});

	it("is null when every message is within the overlap window (fetch them all again)", () => {
		expect(pollCursor([m("a", "2026-10-07T10:00:08.000Z"), m("b", "2026-10-07T10:00:10.000Z")])).toBeNull();
	});
});

describe("formatSentAt", () => {
	it("formats in Manila time regardless of the machine's zone", () => {
		expect(formatSentAt("2026-10-07T10:00:00.000Z")).toBe("7 Oct, 6:00 PM");
		expect(formatSentAt("2026-10-07T16:30:00.000Z")).toBe("8 Oct, 12:30 AM");
	});
});

describe("status", () => {
	it("knows which statuses are open", () => {
		expect(isOpenStatus("NEW")).toBe(true);
		expect(isOpenStatus("RESPONDED")).toBe(true);
		expect(isOpenStatus("DECLINED")).toBe(false);
		expect(isOpenStatus("CLOSED")).toBe(false);
	});

	it("labels every status", () => {
		expect(inquiryStatusLabels).toEqual({ NEW: "New", RESPONDED: "Replied", DECLINED: "Declined", CLOSED: "Closed" });
	});
});
```

  **Format check first.** `Intl.DateTimeFormat("en-PH", …)` output can differ by ICU version, for example a narrow no-break space before "PM". Before fixing the expected strings, print the formatter's actual output in Node 24. Normalise U+202F and U+00A0 to plain spaces in `formatSentAt` so the result is stable. The expected strings stay as written.

- [ ] **Step 2:** Run the test. Expected: FAIL, because the module can't be found.

- [ ] **Step 3: Implement `app/_components/threadMessages.ts`**

```ts
// Pure helpers for the live thread view. No React, no fetch: unit-tested on
// their own and shared by ThreadView and the inbox list.

import type { InquiryMessage, InquiryStatus } from "@/app/_lib/types";

const byTimeThenId = (a: InquiryMessage, b: InquiryMessage) =>
	a.sentAt === b.sentAt ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.sentAt < b.sentAt ? -1 : 1;

// Messages can commit out of sentAt order, so the poller re-reads a short
// overlap. This keeps the first copy of each id and restores the order.
export function mergeMessages(existing: InquiryMessage[], incoming: InquiryMessage[]): InquiryMessage[] {
	const seen = new Set(existing.map((x) => x.id));
	const fresh = incoming.filter((x) => !seen.has(x.id));
	if (fresh.length === 0) return existing;
	return [...existing, ...fresh].sort(byTimeThenId);
}

// The id to pass as ?after=: the newest message at least `overlapSeconds`
// older than the newest one. Null means "send everything".
export function pollCursor(messages: InquiryMessage[], overlapSeconds = 5): string | null {
	const newest = messages.at(-1);
	if (!newest) return null;
	const limit = Date.parse(newest.sentAt) - overlapSeconds * 1000;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (Date.parse(messages[i].sentAt) <= limit) return messages[i].id;
	}
	return null;
}

const formatter = new Intl.DateTimeFormat("en-PH", {
	timeZone: "Asia/Manila",
	day: "numeric",
	month: "short",
	hour: "numeric",
	minute: "2-digit",
	hour12: true,
});

// Fixed zone and locale, so the server render and the client agree.
export function formatSentAt(iso: string): string {
	return formatter.format(new Date(iso)).replace(/[  ]/g, " ");
}

export function isOpenStatus(status: InquiryStatus): boolean {
	return status === "NEW" || status === "RESPONDED";
}
```

  **If the `en-PH` output order differs from the expected strings** (`7 Oct, 6:00 PM`), build the string from `formatToParts` in this order: day, month, then hour:minute and dayPeriod. Ledger the ruling.

  Then append to `app/_lib/constants/labels.ts`, adding `InquiryStatus` to its type import:

```ts
export const inquiryStatusLabels: Record<InquiryStatus, string> = {
	NEW: "New",
	RESPONDED: "Replied",
	DECLINED: "Declined",
	CLOSED: "Closed",
};
```

- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(inbox): message merge, poll cursor, time format and status labels`.

### Task 2: `/inbox` list

**Files:**
- Create:
  - `app/_components/InboxList.tsx`, `InboxList.module.scss`, `InboxList.test.tsx`
  - `app/inbox/(list)/page.tsx`, `page.module.scss`, `page.test.tsx`, `loading.tsx`
- Modify: `app/_components/testing.tsx` (add DEMO fixtures `demoSummary`, `demoThread`)

**Interfaces:**
- **Consumes:** `getCurrentUser`, `listInquiriesForUser`, `inquiryStatusLabels`, `formatSentAt`.
- **Produces:**
  - `InboxList({ items }: { items: InquirySummary[] })`, a server component;
  - DEMO fixtures for Tasks 3–4.

- [ ] **Step 1: Add the fixtures** to `app/_components/testing.tsx`, adding `InquirySummary` and `InquiryThread` to its type import:

```ts
export const demoSummary: InquirySummary = {
	id: "inq_demo",
	role: "RENTER",
	status: "RESPONDED",
	space: { slug: "demo-poblacion-loft", title: "[DEMO] Corner loft with afternoon light" },
	counterpartName: "Demo Host A",
	lastMessage: { body: "Yes, the 20th works.", sentAt: "2026-10-07T10:00:00.000Z", fromMe: false },
	unread: true,
};

export const demoThread: InquiryThread = {
	id: "inq_demo",
	role: "RENTER",
	status: "RESPONDED",
	space: { slug: "demo-poblacion-loft", title: "[DEMO] Corner loft with afternoon light", areaName: "Poblacion", city: "MAKATI" },
	counterpartName: "Demo Host A",
	requesterCompany: "Demo Films",
	shootDate: "2026-10-20",
	durationHours: 6,
	crewSize: 12,
	productionType: "COMMERCIAL",
	budgetNote: null,
	messages: [
		{ id: "m1", body: "Free on the 20th?", sentAt: "2026-10-07T09:00:00.000Z", fromMe: true, senderName: "Demo Renter" },
		{ id: "m2", body: "Yes, the 20th works.", sentAt: "2026-10-07T10:00:00.000Z", fromMe: false, senderName: "Demo Host A" },
	],
	canReply: true,
	canDecline: false,
	canClose: true,
};
```

- [ ] **Step 2: Write the failing tests.** `app/_components/InboxList.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import InboxList from "@/app/_components/InboxList";
import { demoSummary, renderWithTheme } from "@/app/_components/testing";

it("shows the empty state with a way to browse", () => {
	renderWithTheme(<InboxList items={[]} />);
	expect(screen.getByText("No conversations yet.")).toBeInTheDocument();
	expect(screen.getByRole("link", { name: "Browse spaces" })).toHaveAttribute("href", "/");
});

it("renders one list item per thread, linking to the thread", () => {
	renderWithTheme(<InboxList items={[demoSummary, { ...demoSummary, id: "inq_2", unread: false }]} />);
	const items = within(screen.getByRole("list", { name: "Conversations" })).getAllByRole("listitem");
	expect(items).toHaveLength(2);
	expect(within(items[0]).getByRole("link")).toHaveAttribute("href", "/inbox/inq_demo");
});

it("shows space, counterpart, role, preview, time, status and an unread marker", () => {
	renderWithTheme(<InboxList items={[demoSummary]} />);
	const item = screen.getByRole("listitem");
	expect(item).toHaveTextContent("[DEMO] Corner loft with afternoon light");
	expect(item).toHaveTextContent("Demo Host A");
	expect(item).toHaveTextContent("You asked");
	expect(item).toHaveTextContent("Yes, the 20th works.");
	expect(item).toHaveTextContent("7 Oct, 6:00 PM");
	expect(item).toHaveTextContent("Replied");
	expect(within(item).getByText("Unread")).toBeInTheDocument(); // visually hidden text for the dot
});

it("labels the host's own threads and prefixes your own last message", () => {
	renderWithTheme(
		<InboxList items={[{ ...demoSummary, role: "HOST", unread: false, lastMessage: { ...demoSummary.lastMessage, fromMe: true } }]} />,
	);
	const item = screen.getByRole("listitem");
	expect(item).toHaveTextContent("Your listing");
	expect(item).toHaveTextContent("You: Yes, the 20th works.");
	expect(within(item).queryByText("Unread")).not.toBeInTheDocument();
});
```

  `app/inbox/(list)/page.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import InboxPage from "@/app/inbox/(list)/page";
import { demoSummary, demoUser, renderWithTheme } from "@/app/_components/testing";

const mockGetCurrentUser = jest.fn();
const mockList = jest.fn();
const mockRedirect = jest.fn((url: string) => {
	throw new Error(`NEXT_REDIRECT ${url}`);
});
jest.mock("@/app/_lib/server/currentUser", () => ({ getCurrentUser: () => mockGetCurrentUser() }));
jest.mock("@/app/_lib/server/inquiries", () => ({ listInquiriesForUser: (...a: unknown[]) => mockList(...a) }));
jest.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));
jest.mock("next/link", () => ({
	__esModule: true,
	default: ({ prefetch, ...props }: { prefetch?: boolean } & Record<string, unknown>) => (
		<a data-prefetch={String(prefetch)} {...props} />
	),
}));

beforeEach(() => jest.clearAllMocks());

it("redirects to sign-in, coming back to /inbox", async () => {
	mockGetCurrentUser.mockResolvedValue(null);
	await expect(InboxPage()).rejects.toThrow("NEXT_REDIRECT /sign-in?next=%2Finbox");
	expect(mockList).not.toHaveBeenCalled();
});

it("lists the signed-in user's threads under an Inbox heading", async () => {
	mockGetCurrentUser.mockResolvedValue(demoUser);
	mockList.mockResolvedValue([demoSummary]);
	renderWithTheme(await InboxPage());
	expect(mockList).toHaveBeenCalledWith(demoUser.id);
	expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeInTheDocument();
	expect(screen.getByRole("link", { name: /Corner loft/ })).toHaveAttribute("data-prefetch", "false");
});
```

- [ ] **Step 3:** Run the tests. Expected: FAIL, because the modules can't be found.

- [ ] **Step 4: Implement.**
  - **`InboxList.tsx`** is a server component:
    - **Empty:** `<p>No conversations yet.</p>` and a "Browse spaces" `next/link` to `/`.
    - **List:** an `<ul aria-label="Conversations">`. Each `<li>` holds one `<Link href={`/inbox/${id}`} prefetch={false}>` wrapping:
      - the title (`Typography` as `span`);
      - the counterpart name;
      - the role text: "You asked" for `RENTER`, "Your listing" for `HOST`;
      - the preview, prefixed "You: " when `fromMe`;
      - `formatSentAt(lastMessage.sentAt)`;
      - an MUI `Chip` with `inquiryStatusLabels[status]`;
      - when `unread`, a dot `<span className={styles.dot} aria-hidden="true" />` and `<span className={styles.srOnly}>Unread</span>`.
    - **Styling:** a whole-row link with a min-height of 44px, a hairline separator, and unread rows in bold.
  - **`app/inbox/(list)/page.tsx`:**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import InboxList from "@/app/_components/InboxList";
import { SITE_NAME } from "@/app/_lib/constants/site";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { listInquiriesForUser } from "@/app/_lib/server/inquiries";
import styles from "./page.module.scss";

export const metadata: Metadata = { title: `Inbox — ${SITE_NAME}` };

export default async function InboxPage() {
	const user = await getCurrentUser();
	if (!user) redirect(`/sign-in?next=${encodeURIComponent("/inbox")}`);
	const items = await listInquiriesForUser(user.id);
	return (
		<Container component="main" disableGutters maxWidth={false} className={styles.page}>
			<Typography variant="displayLg" component="h1">
				Inbox
			</Typography>
			<InboxList items={items} />
		</Container>
	);
}
```

  - **TS narrowing:** if TypeScript doesn't narrow `user` after `redirect()` (it returns `never`, so it should), keep the explicit `if (!user) { redirect(...); }`. Don't add a non-null `!`.
  - **`app/inbox/(list)/loading.tsx`:** a skeleton, the same pattern as `app/(browse)/loading.tsx`. It must be inside `(list)`, never at `app/inbox/loading.tsx`.
  - **Error state:** the root `app/error.tsx` already covers it. Don't add another.

- [ ] **Step 5:** Run the tests. Expected: PASS.
- [ ] **Step 6: Commit** with `feat(inbox): inbox list page`.

### Task 3: `ThreadView`, the live thread

**Files:**
- Create: `app/_components/ThreadView.tsx`, `ThreadView.module.scss`, `ThreadView.test.tsx`

**Interfaces:**
- **Consumes:**
  - `mergeMessages`, `pollCursor`, `formatSentAt`, `isOpenStatus` (Task 1);
  - `validateMessageBody` from `@/app/_lib/inquiryValidation`;
  - `THREAD_POLL_SECONDS`;
  - the API shapes `MessagesResponse`, `PostMessageResponse`, `StatusResponse` and `InquiryApiError`.
- **Produces:** `ThreadView({ thread }: { thread: InquiryThread })`, a client component.

- [ ] **Step 1: Write the failing test** `app/_components/ThreadView.test.tsx`

```tsx
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThreadView from "@/app/_components/ThreadView";
import { demoThread, renderWithTheme } from "@/app/_components/testing";

const mockFetch = jest.fn();
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) });
let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
	jest.useFakeTimers();
	mockFetch.mockReset();
	global.fetch = mockFetch;
	visibility = "visible";
	Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => jest.useRealTimers());

const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
const tick = (s: number) => act(async () => { await jest.advanceTimersByTimeAsync(s * 1000); });
const setVisibility = (v: DocumentVisibilityState) =>
	act(() => {
		visibility = v;
		document.dispatchEvent(new Event("visibilitychange"));
	});
const messages = () => within(screen.getByRole("list", { name: "Messages" })).getAllByRole("listitem");

it("renders the messages oldest first with sender and time", () => {
	renderWithTheme(<ThreadView thread={demoThread} />);
	const items = messages();
	expect(items).toHaveLength(2);
	expect(items[0]).toHaveTextContent("Demo Renter");
	expect(items[0]).toHaveTextContent("Free on the 20th?");
	expect(items[1]).toHaveTextContent("Demo Host A");
	expect(items[1]).toHaveTextContent("7 Oct, 6:00 PM");
});

it("polls every 15 s with a 5 s-overlap cursor and appends without duplicates", async () => {
	mockFetch.mockResolvedValue(
		reply(200, {
			status: "RESPONDED",
			messages: [demoThread.messages[1], { id: "m3", body: "See you then", sentAt: "2026-10-07T10:05:00.000Z", fromMe: false, senderName: "Demo Host A" }],
		}),
	);
	renderWithTheme(<ThreadView thread={demoThread} />);
	expect(mockFetch).not.toHaveBeenCalled();
	await tick(15);
	expect(mockFetch).toHaveBeenCalledWith("/api/inquiries/inq_demo/messages?after=m1", expect.objectContaining({ cache: "no-store" }));
	expect(messages()).toHaveLength(3);
	expect(messages()[2]).toHaveTextContent("See you then");
});

it("doesn't poll while the tab is hidden, and polls at once when it's visible again", async () => {
	mockFetch.mockResolvedValue(reply(200, { status: "RESPONDED", messages: [] }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	setVisibility("hidden");
	await tick(3600);
	expect(mockFetch).not.toHaveBeenCalled();
	setVisibility("visible");
	await tick(0);
	expect(mockFetch).toHaveBeenCalledTimes(1);
});

it("stops polling on unmount", async () => {
	mockFetch.mockResolvedValue(reply(200, { status: "RESPONDED", messages: [] }));
	const { unmount } = renderWithTheme(<ThreadView thread={demoThread} />);
	unmount();
	await tick(60);
	expect(mockFetch).not.toHaveBeenCalled();
});

it("goes read-only when a poll reports the thread was closed", async () => {
	mockFetch.mockResolvedValue(reply(200, { status: "CLOSED", messages: [] }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	await tick(15);
	expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
	expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "Close conversation" })).not.toBeInTheDocument();
});

it("stops polling and asks to sign in again on 401", async () => {
	mockFetch.mockResolvedValue(reply(401, { error: "UNAUTHENTICATED" }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	await tick(15);
	const alert = screen.getByRole("alert");
	expect(alert).toHaveTextContent("Your session ended.");
	expect(within(alert).getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/sign-in?next=%2Finbox%2Finq_demo");
	await tick(60);
	expect(mockFetch).toHaveBeenCalledTimes(1);
});

it("stops polling on 404 and says the conversation is gone", async () => {
	mockFetch.mockResolvedValue(reply(404, { error: "NOT_FOUND" }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	await tick(15);
	expect(screen.getByRole("alert")).toHaveTextContent("This conversation is no longer available.");
	await tick(60);
	expect(mockFetch).toHaveBeenCalledTimes(1);
});

it("sends a reply, appends it and clears the box", async () => {
	const sent = { id: "m9", body: "Great, thanks", sentAt: "2026-10-07T10:10:00.000Z", fromMe: true, senderName: "Demo Renter" };
	mockFetch.mockResolvedValue(reply(201, { message: sent }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().type(screen.getByLabelText("Reply"), "  Great, thanks  ");
	await user().click(screen.getByRole("button", { name: "Send" }));
	expect(mockFetch).toHaveBeenCalledWith(
		"/api/inquiries/inq_demo/messages",
		expect.objectContaining({ method: "POST", body: JSON.stringify({ body: "Great, thanks" }) }),
	);
	expect(messages()).toHaveLength(3);
	expect(screen.getByLabelText("Reply")).toHaveValue("");
});

it("validates the reply on the client", async () => {
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().click(screen.getByRole("button", { name: "Send" }));
	expect(screen.getByText("Write a message.")).toBeInTheDocument();
	expect(mockFetch).not.toHaveBeenCalled();
});

it("on 409 keeps the typed text, disables the box and says it was closed", async () => {
	mockFetch.mockResolvedValue(reply(409, { error: "THREAD_CLOSED" }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().type(screen.getByLabelText("Reply"), "Still on?");
	await user().click(screen.getByRole("button", { name: "Send" }));
	expect(screen.getByRole("alert")).toHaveTextContent("This conversation was closed.");
	expect(screen.getByLabelText("Reply")).toHaveValue("Still on?");
	expect(screen.getByLabelText("Reply")).toBeDisabled();
});

it("shows the rate-limit and generic errors and keeps the text", async () => {
	mockFetch.mockResolvedValueOnce(reply(429, { error: "RATE_LIMITED" }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().type(screen.getByLabelText("Reply"), "Hello");
	await user().click(screen.getByRole("button", { name: "Send" }));
	expect(screen.getByRole("alert")).toHaveTextContent("You've sent a lot of messages. Try again later.");
	mockFetch.mockRejectedValueOnce(new Error("offline"));
	await user().click(screen.getByRole("button", { name: "Send" }));
	expect(screen.getByRole("alert")).toHaveTextContent("We couldn't send that. Try again.");
	expect(screen.getByLabelText("Reply")).toHaveValue("Hello");
});

it("confirms in the page before closing, then goes read-only", async () => {
	mockFetch.mockResolvedValue(reply(200, { status: "CLOSED" }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().click(screen.getByRole("button", { name: "Close conversation" }));
	expect(screen.getByText("Close this conversation? Neither of you can send more messages.")).toBeInTheDocument();
	expect(mockFetch).not.toHaveBeenCalled();
	await user().click(screen.getByRole("button", { name: "Yes, close it" }));
	expect(mockFetch).toHaveBeenCalledWith(
		"/api/inquiries/inq_demo/status",
		expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "close" }) }),
	);
	expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
});

it("cancelling the confirmation sends nothing", async () => {
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().click(screen.getByRole("button", { name: "Close conversation" }));
	await user().click(screen.getByRole("button", { name: "Cancel" }));
	expect(mockFetch).not.toHaveBeenCalled();
	expect(screen.getByRole("button", { name: "Close conversation" })).toBeInTheDocument();
});

it("offers Decline only to the host", async () => {
	const { unmount } = renderWithTheme(<ThreadView thread={demoThread} />);
	expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
	unmount();
	mockFetch.mockResolvedValue(reply(200, { status: "DECLINED" }));
	renderWithTheme(<ThreadView thread={{ ...demoThread, role: "HOST", canDecline: true }} />);
	await user().click(screen.getByRole("button", { name: "Decline" }));
	await user().click(screen.getByRole("button", { name: "Yes, decline" }));
	expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ action: "decline" });
	expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
});

it("renders read-only from the start for a closed thread and doesn't poll", async () => {
	renderWithTheme(<ThreadView thread={{ ...demoThread, status: "DECLINED", canReply: false, canClose: false }} />);
	expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
	await tick(60);
	expect(mockFetch).not.toHaveBeenCalled();
});
```

- [ ] **Step 2:** Run the test. Expected: FAIL, because the module can't be found.

- [ ] **Step 3: Implement `app/_components/ThreadView.tsx`.** It must meet the tests and these rules:

  **State and derived values**
  - **State:** `messages` (starts as `thread.messages`), `status`, `draft`, `fieldError`, `alert`, `sending`, `confirming`, and `stopped` (set by a 401 or 404).
  - **Alert values:** `{ kind: "session" } | { kind: "gone" } | { kind: "closed-on-send" } | { kind: "text"; text: string } | null`.
  - **`confirming`:** `"close" | "decline" | null`.
  - **`open = isOpenStatus(status)`.** `canDecline = open && thread.role === "HOST"`. `canClose = open`. Ignore the server's `can*` flags after the first render: the status is the source of truth once it changes.

  **Poller**
  - **Effect** keyed on `open` and `stopped`. It does nothing unless `open && !stopped`.
  - **Interval:** `setInterval(poll, THREAD_POLL_SECONDS * 1000)`. Each tick returns early when `document.visibilityState !== "visible"`.
  - **Visibility listener:** a `visibilitychange` listener calls `poll()` at once when the tab becomes visible.
  - **Cleanup** clears both the interval and the listener.
  - **`poll()`:**
    - Fetches `/api/inquiries/${id}/messages${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}` with `{ cache: "no-store" }`. The cursor comes from `pollCursor(messagesRef.current)`; use a ref so the interval sees the latest messages.
    - **200:** `setMessages(prev => mergeMessages(prev, data.messages))` and `setStatus(data.status)`.
    - **401:** `alert = session`, `stopped = true`.
    - **404:** `alert = gone`, `stopped = true`.
    - **Anything else, or a network error:** ignore it silently and let the next tick retry.
  - **No overlapping polls:** skip a poll if one is already in flight.

  **Reply box**
  - **Markup:** `<form aria-label="Reply to <counterpartName>">` with an MUI `TextField multiline minRows={3}` labelled "Reply", and a "Send" button that reads "Sending…" and is disabled while sending.
  - **Validation:** `validateMessageBody(draft)`. If it fails, set `fieldError` and don't fetch.
  - **POST** `/api/inquiries/${id}/messages` with `JSON.stringify({ body: validated.value })` and a JSON content-type.
  - **Responses:**

    | Response | Result |
    | --- | --- |
    | 201 | merge the message, clear the draft |
    | 409 | `alert = closed-on-send`; set status to CLOSED, unless the next poll gives the exact one |
    | 401 | session |
    | 404 | gone |
    | 429 | text "You've sent a lot of messages. Try again later." |
    | other, or a network error | text "We couldn't send that. Try again." |

  - **Keep the draft** on every error.
  - **When `!open`:** show `<p>This conversation is closed.</p>`. If `alert` is `closed-on-send`, still render the box, disabled with its text, so the typed reply isn't lost.

  **Status actions**
  - **Buttons:** "Decline" (when `canDecline`) and "Close conversation" (when `canClose`).
  - **Confirming** shows an inline confirmation instead of the buttons:
    - text "Close this conversation? Neither of you can send more messages." with a "Yes, close it" button; or
    - text "Decline this inquiry? The renter will see it's declined and can't reply." with a "Yes, decline" button;
    - plus "Cancel".
    - Focus moves to the confirm button when it appears.
  - **Confirm** posts `{ action }` to `/api/inquiries/${id}/status`.
    - 200: `setStatus(data.status)`.
    - 409: set status to CLOSED.
    - 401 or 404: handle as above.
    - Anything else: text "We couldn't update this conversation. Try again."

  **Alerts and layout**
  - **Alerts:** an MUI `Alert` (`role="alert"`).
    - session: "Your session ended. Sign in again" with a link to `/sign-in?next=${encodeURIComponent(`/inbox/${id}`)}`.
    - gone: "This conversation is no longer available." with a link to "/inbox".
    - closed-on-send: "This conversation was closed."
  - **Messages:** `<ol aria-label="Messages">`. Each `<li>` holds the sender name, a `<time dateTime={sentAt}>` showing `formatSentAt(sentAt)`, and the body with `white-space: pre-wrap`.
    - Use a `fromMe` class to align your own messages.
    - After you send, and after a poll adds messages, scroll the newest message into view with `scrollIntoView?.()`. jsdom lacks it, so guard the call.
  - **No `console.*`.**

- [ ] **Step 4:** Run the test. Expected: PASS. If fake timers and `userEvent` conflict, keep `userEvent.setup({ advanceTimers: jest.advanceTimersByTime })` as written. Don't switch to real timers.
- [ ] **Step 5: Commit** with `feat(inbox): live thread view with polling, replies and status actions`.

### Task 4: `/inbox/[id]` page and the header link

**Files:**
- Create: `app/_components/ThreadSummary.tsx`, `ThreadSummary.module.scss`, `ThreadSummary.test.tsx`, `app/inbox/[id]/page.tsx`, `page.module.scss`, `page.test.tsx`
- Modify: `app/_components/SiteHeader.tsx`, `SiteHeader.test.tsx`, and `SiteHeader.module.scss` if needed

**Interfaces:**
- **Consumes:** `getCurrentUser`, `getInquiryThread`, `ThreadView` (Task 3), `productionTypeLabels`, `cityLabels`, `inquiryStatusLabels`.
- **Produces:** the route `/inbox/[id]`, and an "Inbox" link in the header for signed-in users.

- [ ] **Step 1: Write the failing tests.**

  `app/_components/ThreadSummary.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import ThreadSummary from "@/app/_components/ThreadSummary";
import { demoThread, renderWithTheme } from "@/app/_components/testing";

it("names the space, links to the listing and shows the counterpart and status", () => {
	renderWithTheme(<ThreadSummary thread={demoThread} />);
	expect(screen.getByRole("heading", { level: 1, name: "[DEMO] Corner loft with afternoon light" })).toBeInTheDocument();
	expect(screen.getByRole("link", { name: "View listing" })).toHaveAttribute("href", "/spaces/demo-poblacion-loft");
	expect(screen.getByText("With Demo Host A · Poblacion, Makati")).toBeInTheDocument();
	expect(screen.getByText("Replied")).toBeInTheDocument();
});

it("lists the inquiry details that were given", () => {
	renderWithTheme(<ThreadSummary thread={demoThread} />);
	const details = screen.getByRole("list", { name: "Inquiry details" });
	expect(details).toHaveTextContent("Shoot date");
	expect(details).toHaveTextContent("20 Oct 2026");
	expect(details).toHaveTextContent("6 hours");
	expect(details).toHaveTextContent("Crew of 12");
	expect(details).toHaveTextContent("Commercial");
	expect(details).not.toHaveTextContent("Budget");
});

it("shows the requester's company to the host only", () => {
	const { unmount } = renderWithTheme(<ThreadSummary thread={demoThread} />);
	expect(screen.queryByText("Demo Films")).not.toBeInTheDocument();
	unmount();
	renderWithTheme(<ThreadSummary thread={{ ...demoThread, role: "HOST", counterpartName: "Demo Renter" }} />);
	expect(screen.getByText("Demo Films")).toBeInTheDocument();
});
```

  `app/inbox/[id]/page.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import ThreadPage from "@/app/inbox/[id]/page";
import { demoThread, demoUser, renderWithTheme } from "@/app/_components/testing";

const mockGetCurrentUser = jest.fn();
const mockGetThread = jest.fn();
jest.mock("@/app/_lib/server/currentUser", () => ({ getCurrentUser: () => mockGetCurrentUser() }));
jest.mock("@/app/_lib/server/inquiries", () => ({ getInquiryThread: (...a: unknown[]) => mockGetThread(...a) }));
jest.mock("@/app/_components/ThreadView", () => ({ __esModule: true, default: () => <div data-testid="thread-view" /> }));
jest.mock("next/navigation", () => ({
	redirect: (url: string) => {
		throw new Error(`NEXT_REDIRECT ${url}`);
	},
	notFound: () => {
		throw new Error("NEXT_NOT_FOUND");
	},
}));

const params = Promise.resolve({ id: "inq_demo" });
beforeEach(() => jest.clearAllMocks());

it("redirects to sign-in, coming back to this thread", async () => {
	mockGetCurrentUser.mockResolvedValue(null);
	await expect(ThreadPage({ params })).rejects.toThrow("NEXT_REDIRECT /sign-in?next=%2Finbox%2Finq_demo");
	expect(mockGetThread).not.toHaveBeenCalled();
});

it("404s when the thread is missing or not yours", async () => {
	mockGetCurrentUser.mockResolvedValue(demoUser);
	mockGetThread.mockResolvedValue(null);
	await expect(ThreadPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
	expect(mockGetThread).toHaveBeenCalledWith("inq_demo", demoUser.id);
});

it("renders the summary and the live view", async () => {
	mockGetCurrentUser.mockResolvedValue(demoUser);
	mockGetThread.mockResolvedValue(demoThread);
	renderWithTheme(await ThreadPage({ params }));
	expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Corner loft");
	expect(screen.getByTestId("thread-view")).toBeInTheDocument();
	expect(screen.getByRole("link", { name: "Back to inbox" })).toHaveAttribute("href", "/inbox");
});
```

  In `SiteHeader.test.tsx`, add:
  - signed in → a link "Inbox" with `href="/inbox"`;
  - signed out → no Inbox link.

  Update any existing assertion that counts links.

- [ ] **Step 2:** Run the tests. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **`ThreadSummary.tsx`** is a server component:
    - **Heading:** an `h1` with the space title.
    - **Listing link:** "View listing" to `/spaces/<slug>`.
    - **Subline:** "With <counterpartName> · <areaName>, <cityLabels[city]>".
    - **Status:** a `Chip` with `inquiryStatusLabels[status]`.
    - **Details:** `<ul aria-label="Inquiry details">`, listing only the fields that are non-null:
      - "Shoot date" `20 Oct 2026`: format the `YYYY-MM-DD` string as a calendar date with UTC parts, no time zone shift;
      - "<n> hour(s)";
      - "Crew of <n>";
      - `productionTypeLabels[productionType]` (always shown);
      - "Budget: <note>";
      - the requester company, only when `role === "HOST"`.
  - **`app/inbox/[id]/page.tsx`:**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Container from "@mui/material/Container";
import ThreadSummary from "@/app/_components/ThreadSummary";
import ThreadView from "@/app/_components/ThreadView";
import { SITE_NAME } from "@/app/_lib/constants/site";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { getInquiryThread } from "@/app/_lib/server/inquiries";
import styles from "./page.module.scss";

// Generic title on purpose: generateMetadata would read the thread a second
// time and mark it read again.
export const metadata: Metadata = { title: `Conversation — ${SITE_NAME}` };

type Props = { params: Promise<{ id: string }> };

export default async function ThreadPage({ params }: Props) {
	const { id } = await params;
	const user = await getCurrentUser();
	if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/inbox/${id}`)}`);
	const thread = await getInquiryThread(id, user.id);
	if (!thread) notFound();
	return (
		<Container component="main" disableGutters maxWidth={false} className={styles.page}>
			<Link href="/inbox" className={styles.back}>
				Back to inbox
			</Link>
			<ThreadSummary thread={thread} />
			<ThreadView thread={thread} />
		</Container>
	);
}
```

  - **No `loading.tsx`** may sit at `app/inbox/` or `app/inbox/[id]/`. The 404 must stay a 404.
  - **`SiteHeader.tsx`:** when `user` is set, render `<Link href="/inbox" className={styles.link}>Inbox</Link>` before the Host chip and the account menu. It's a plain link with a 44px target, so default prefetch is fine; it's the list, not a thread.

- [ ] **Step 4:** Run the tests, then the whole suite, `pnpm typecheck`, `pnpm lint`, and `pnpm build` with the throwaway values.
- [ ] **Step 5: Manual check** (local Docker; start it if it's down). Run `pnpm dev` with throwaway `BETTER_AUTH_*` values and no Resend key, then check:
  1. A renter sends an inquiry (5b-2 form). The header shows "Inbox"; `/inbox` lists the thread; opening it shows the summary and the message.
  2. In a second browser profile, sign in as the host by temporarily setting a verified demo host's `contactEmail`, and back up the original. `/inbox` shows the thread as unread with "Your listing". Open it and reply.
  3. Back in the renter's tab, the reply appears within about 15 s with no reload.
  4. An unknown id or another user's thread returns HTTP 404 (`curl -o /dev/null -w "%{http_code}"`).
  5. The host clicks Decline, then confirms. The renter's open tab goes read-only on its next poll.
  6. Signed out, `/inbox` redirects to `/sign-in?next=%2Finbox`.
  7. Clean up: restore the host, delete every row you created, and delete the logs containing tokens.
- [ ] **Step 6: Commit** with `feat(inbox): thread page and header inbox link`.
- [ ] **Step 7: Checkpoint.** Stop. The main session sends it to `reviewer`.
