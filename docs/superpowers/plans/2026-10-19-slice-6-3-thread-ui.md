# Slice 6-3 — Thread Safety UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the thread page, either side can report the conversation, or block or unblock the other person. The view also follows the server's `canReply`, so a blocked thread or one whose host is no longer verified becomes read-only.

**Architecture:**
- **`ThreadView`** (the existing client component) owns the state. Two new pieces of state: `sendable`, seeded from `thread.canReply` and updated by every poll, and `blockedByMe`, seeded from the thread and updated by block and unblock.
- **Two new presentational components:**
  - **`ThreadMenu`:** the "More" button and its menu.
  - **`ReportDialog`:** an MUI `Dialog` with the report form. It posts the report and, when asked, the block.
- **Block confirmation** reuses `ThreadView`'s existing in-page confirm pattern. It never uses `window.confirm`.

**Tech Stack:** Next.js 16.4 App Router, MUI 9 (`Menu`, `Dialog`, `RadioGroup`, `Checkbox`), SCSS modules and tokens, Jest 30, React Testing Library and user-event with fake timers.

**Spec:** `docs/superpowers/specs/2026-10-18-slice-6-safety-design.md`, section **Pages**. The 6-2 API this builds on is now in `main`:
- `POST`/`DELETE /api/inquiries/[id]/block` returns `BlockResponse`, or 404, or 409 `NOT_LINKED`.
- `POST /api/inquiries/[id]/report` returns `CreateReportResponse`, or 400 with `ReportApiError` fields, 404, or 429.
- `MessagesResponse.canReply` and `InquiryThread.blockedByMe` are new fields.
- `POST /api/inquiries` can return 403 `BLOCKED`.

## Global Constraints

- **Branch and commits.** Work on `feat/slice-6-3-thread-ui`, branched from `main` at `ef82217`. Commit locally at each commit step, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push or rebase.
- **Ownership.**
  - Every task goes to `frontend-dev`.
  - No backend files change.
  - `app/_lib/types.ts` doesn't change.
  - Imports from `@/app/_lib/reportValidation`, `@/app/_lib/constants/*` and `@/generated/prisma/enums` are fine. `InquiryForm` already imports enums this way.
- **Off limits:** new dependencies, `prisma/**`, lockfiles, `.env*`.
- **Styling.**
  - SCSS modules and tokens only, through `@use "../_styles/tokens" as *;`.
  - No `sx`, no `styled()`, no `style={{}}`, no raw colour, spacing or radius values.
  - Touch targets at least 44px.
  - Labelled inputs, with the radio group inside a `fieldset` and `legend`.
- **`"use client"` stays only on `ThreadView`.** `ThreadMenu` and `ReportDialog` are imported only by `ThreadView`, so they run on the client without the directive.
- **No `window.confirm`.** Block confirms in the page. Unblock needs no confirmation.
- **Neutral wording to the blocked side.**
  - Nothing tells a user that the *other* side blocked them.
  - Every read-only state that isn't "you blocked them" shows the existing `This conversation is closed.`
- **Copy, verbatim:**
  - menu trigger `More`; menu items `Report conversation`, `Block {name}` and `Unblock {name}`;
  - block question: `Block {name}? Neither of you will be able to send messages in your conversations, and they won't be able to send you new inquiries. They won't be told.`, with the button `Yes, block {name}`;
  - blocked notice `You blocked {name}.` with the button `Unblock`;
  - not-linked message `You can block this host once they've joined Iskawt.`;
  - dialog title `Report conversation`; lead `Reports go to the Iskawt team. {name} isn't told.`; legend `Reason`;
  - details field `Details (optional)`, with the counter `{n}/1000`, counted in code points;
  - checkbox `Also block {name}`;
  - buttons `Cancel` and `Send report` (`Sending…` while it sends);
  - success: `Thanks. Someone from Iskawt will look at this.`, with the button `Done`;
  - errors:
    - 429: `You've sent a lot of reports today. Try again tomorrow.`
    - 404: `This conversation is no longer available.`
    - 401: `Your session ended.` plus the link `Sign in again`
    - anything else: `We couldn't send that report. Try again.`
    - a failed block after the report: `We couldn't block {name}. You can try again from the More menu.`
  - inquiry form, on `BLOCKED`: `You can't send inquiries to this host.`
- **TypeScript strict.** No `any`, no `@ts-ignore`, no non-null `!`. Narrow strings to `ReportReason` by lookup, not with `as`.
- **Tests first.** Watch each new test fail before you implement.
- **Commands.** Run one file with `pnpm exec jest "<path regex>"`. Then run `pnpm typecheck` and `pnpm lint`, and once at the end, `pnpm build` with `BETTER_AUTH_SECRET=throwaway-dev-secret-0123456789abcdef BETTER_AUTH_URL=http://localhost:3000`.

## Review Focus

1. **Unblocking while the other side still blocks you.** The "You blocked" notice goes away, but the next poll says `canReply: false`. The thread must then read "This conversation is closed." and show no reply box. It must not flash a reply box that 409s. Test: Task 3.
2. **The thread becomes sendable again while it's open.** The other side unblocks, or the host is re-verified. The poller keeps running whenever the *status* is open, even while the thread is read-only, and brings back the reply box once a poll says `canReply: true`. Test: Task 3.
3. **Blocking a closed thread.** It must still work: the More menu shows on closed threads, and the block confirmation appears even though Close and Decline are gone. Test: Task 3.
4. **The report is sent but the block that follows fails** (409 `NOT_LINKED`, or a network error). The report still counts and the thanks still shows, with a note that the block didn't happen. `onBlocked` is not called. Test: Task 1.
5. **Leaving the menu with the keyboard, or opening the dialog a second time.**
   - Escape on the menu returns focus to the More button.
   - Escape on the dialog closes it without sending.
   - Opening the dialog again shows a clean form. Test: Tasks 1 and 2.

---

### Task 1: `ReportDialog`

**Files:**
- Create: `app/_components/ReportDialog.tsx`, `app/_components/ReportDialog.module.scss`
- Test: `app/_components/ReportDialog.test.tsx`

**Interfaces:**
- Consumes:
  - `validateNewReport(input: unknown)` from `@/app/_lib/reportValidation`;
  - `reportReasonLabels` from `@/app/_lib/constants/labels`;
  - `REPORT_DETAIL_MAX` from `@/app/_lib/constants/inquiries`;
  - the enum object `ReportReason` from `@/generated/prisma/enums`;
  - the types `BlockResponse`, `ReportApiError`, `ReportFieldErrors` and `ReportReason` from `@/app/_lib/types`.
- Produces:

```tsx
export default function ReportDialog(props: {
	inquiryId: string;
	counterpartName: string;
	open: boolean;
	onClose: () => void;
	onBlocked: () => void; // called once the "Also block" request succeeded
}): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

Create `app/_components/ReportDialog.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportDialog from "@/app/_components/ReportDialog";
import { renderWithTheme } from "@/app/_components/testing";

const mockFetch = jest.fn();
const onClose = jest.fn();
const onBlocked = jest.fn();
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) });
// Routes fetch by endpoint.
const route = (handlers: { report?: () => unknown; block?: () => unknown }) =>
	mockFetch.mockImplementation((url: string) =>
		Promise.resolve(url.endsWith("/block") ? handlers.block?.() : handlers.report?.()),
	);

beforeEach(() => {
	mockFetch.mockReset();
	onClose.mockReset();
	onBlocked.mockReset();
	global.fetch = mockFetch;
});

const props = { inquiryId: "inq_demo", counterpartName: "Demo Host A", open: true, onClose, onBlocked };
const dialog = () => screen.getByRole("dialog", { name: "Report conversation" });
const send = () => userEvent.click(screen.getByRole("button", { name: "Send report" }));

it("labels every reason, the details field with a counter, and the block option", () => {
	renderWithTheme(<ReportDialog {...props} />);
	const group = within(dialog()).getByRole("radiogroup");
	expect(within(group).getAllByRole("radio")).toHaveLength(5);
	for (const label of ["Spam", "Scam or phishing", "Harassment", "Not their space to list", "Something else"]) {
		expect(screen.getByLabelText(label)).toBeInTheDocument();
	}
	expect(screen.getByRole("group", { name: "Reason" })).toBeInTheDocument();
	expect(screen.getByLabelText("Details (optional)")).toBeInTheDocument();
	expect(screen.getByText("0/1000")).toBeInTheDocument();
	expect(screen.getByLabelText("Also block Demo Host A")).not.toBeChecked();
	expect(screen.getByText("Reports go to the Iskawt team. Demo Host A isn't told.")).toBeInTheDocument();
});

it("renders nothing while closed", () => {
	renderWithTheme(<ReportDialog {...props} open={false} />);
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("asks for a reason on the client and doesn't post", async () => {
	renderWithTheme(<ReportDialog {...props} />);
	await send();
	expect(screen.getByText("Choose a reason.")).toBeInTheDocument();
	expect(mockFetch).not.toHaveBeenCalled();
});

it("counts characters, not UTF-16 units, and refuses more than 1000", async () => {
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Details (optional)"));
	await userEvent.paste("🎬🎬");
	expect(screen.getByText("2/1000")).toBeInTheDocument();
	await userEvent.paste("x".repeat(999));
	await userEvent.click(screen.getByLabelText("Spam"));
	await send();
	expect(screen.getByText("Keep it under 1000 characters.")).toBeInTheDocument();
	expect(mockFetch).not.toHaveBeenCalled();
});

it("posts the reason and trimmed detail, then thanks; no block when unchecked", async () => {
	route({ report: () => reply(201, { id: "rep_1" }) });
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Scam or phishing"));
	await userEvent.type(screen.getByLabelText("Details (optional)"), "  Asked for a deposit  ");
	await send();
	expect(await screen.findByText("Thanks. Someone from Iskawt will look at this.")).toBeInTheDocument();
	expect(mockFetch).toHaveBeenCalledTimes(1);
	expect(mockFetch).toHaveBeenCalledWith(
		"/api/inquiries/inq_demo/report",
		expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "SCAM_OR_PHISHING", detail: "Asked for a deposit" }) }),
	);
	expect(onBlocked).not.toHaveBeenCalled();
	await userEvent.click(screen.getByRole("button", { name: "Done" }));
	expect(onClose).toHaveBeenCalled();
});

it("with Also block: reports, then blocks, then calls onBlocked", async () => {
	route({ report: () => reply(201, { id: "rep_1" }), block: () => reply(200, { blockedByMe: true }) });
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Harassment"));
	await userEvent.click(screen.getByLabelText("Also block Demo Host A"));
	await send();
	expect(await screen.findByText("Thanks. Someone from Iskawt will look at this.")).toBeInTheDocument();
	expect(mockFetch.mock.calls.map(([url]: [string]) => url)).toEqual(["/api/inquiries/inq_demo/report", "/api/inquiries/inq_demo/block"]);
	expect(mockFetch.mock.calls[1][1]).toEqual(expect.objectContaining({ method: "POST" }));
	expect(onBlocked).toHaveBeenCalledTimes(1);
});

it.each([
	["409 NOT_LINKED", () => reply(409, { error: "NOT_LINKED" }), "You can block this host once they've joined Iskawt."],
	["a server error", () => reply(500, {}), "We couldn't block Demo Host A. You can try again from the More menu."],
	["a network error", () => Promise.reject(new Error("offline")), "We couldn't block Demo Host A. You can try again from the More menu."],
])("report sent but block failed (%s): thanks, a note, no onBlocked", async (_label, block, note) => {
	route({ report: () => reply(201, { id: "rep_1" }), block });
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Spam"));
	await userEvent.click(screen.getByLabelText("Also block Demo Host A"));
	await send();
	expect(await screen.findByText("Thanks. Someone from Iskawt will look at this.")).toBeInTheDocument();
	expect(screen.getByText(note)).toBeInTheDocument();
	expect(onBlocked).not.toHaveBeenCalled();
});

it.each([
	[429, { error: "RATE_LIMITED" }, "You've sent a lot of reports today. Try again tomorrow."],
	[404, { error: "NOT_FOUND" }, "This conversation is no longer available."],
	[500, {}, "We couldn't send that report. Try again."],
])("shows the error for %i and keeps the form", async (status, body, text) => {
	route({ report: () => reply(status, body) });
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Spam"));
	await send();
	expect(await screen.findByText(text)).toBeInTheDocument();
	expect(screen.getByLabelText("Spam")).toBeChecked();
	expect(screen.getByRole("button", { name: "Send report" })).toBeEnabled();
});

it("shows server field errors from a 400", async () => {
	route({ report: () => reply(400, { error: "VALIDATION", fields: { detail: "Remove unsupported characters." } }) });
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Spam"));
	await send();
	expect(await screen.findByText("Remove unsupported characters.")).toBeInTheDocument();
});

it("on 401 links back to sign-in for this thread", async () => {
	route({ report: () => reply(401, { error: "UNAUTHENTICATED" }) });
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Spam"));
	await send();
	expect(await screen.findByText(/Your session ended\./)).toBeInTheDocument();
	expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/sign-in?next=%2Finbox%2Finq_demo");
});

it("on a network error says so and re-enables the button", async () => {
	mockFetch.mockRejectedValue(new Error("offline"));
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Spam"));
	await send();
	expect(await screen.findByText("We couldn't send that report. Try again.")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Send report" })).toBeEnabled();
});

it("Cancel and Escape close without posting, and reopening shows a clean form", async () => {
	const { rerender } = renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Spam"));
	await userEvent.type(screen.getByLabelText("Details (optional)"), "draft");
	await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(onClose).toHaveBeenCalledTimes(1);
	await userEvent.keyboard("{Escape}");
	expect(onClose).toHaveBeenCalledTimes(2);
	expect(mockFetch).not.toHaveBeenCalled();
	rerender(<ReportDialog {...props} open={false} />);
	rerender(<ReportDialog {...props} open />);
	expect(screen.getByLabelText("Spam")).not.toBeChecked();
	expect(screen.getByLabelText("Details (optional)")).toHaveValue("");
});
```

If `renderWithTheme`'s `rerender` doesn't keep the theme wrapper, wrap the `rerender` argument the same way `renderWithTheme` does (see `app/_components/testing.tsx`).

Run: `pnpm exec jest "ReportDialog"`. Expected: FAIL. The module doesn't exist yet.

- [ ] **Step 2: Styles**

Create `app/_components/ReportDialog.module.scss`:

```scss
@use "../_styles/tokens" as *;

.content {
	display: flex;
	flex-direction: column;
	gap: space(4);
}

.lead {
	margin: 0;
	color: $color-ink-muted;
}

.option,
.button {
	min-height: 44px;
}

.link {
	color: inherit;
}
```

- [ ] **Step 3: Implement**

Create `app/_components/ReportDialog.tsx`:

```tsx
import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { REPORT_DETAIL_MAX } from "@/app/_lib/constants/inquiries";
import { reportReasonLabels } from "@/app/_lib/constants/labels";
import { validateNewReport } from "@/app/_lib/reportValidation";
import { ReportReason } from "@/generated/prisma/enums";
import type { BlockResponse, ReportApiError, ReportFieldErrors } from "@/app/_lib/types";
import styles from "./ReportDialog.module.scss";

const REASONS = Object.values(ReportReason);
const THANKS_TEXT = "Thanks. Someone from Iskawt will look at this.";
const RATE_LIMITED_TEXT = "You've sent a lot of reports today. Try again tomorrow.";
const GONE_TEXT = "This conversation is no longer available.";
const FAILED_TEXT = "We couldn't send that report. Try again.";
const NOT_LINKED_TEXT = "You can block this host once they've joined Iskawt.";
const blockFailedText = (name: string) => `We couldn't block ${name}. You can try again from the More menu.`;

type Props = {
	inquiryId: string;
	counterpartName: string;
	open: boolean;
	onClose: () => void;
	onBlocked: () => void;
};

type Notice = { text: string; signIn: boolean } | null;
type Phase = { kind: "form" } | { kind: "sent"; note: string | null };

// Report a conversation, and optionally block the other person in the same go.
// The report and the block are two requests: a failed block never undoes a
// sent report, it only adds a note.
export default function ReportDialog({ inquiryId, counterpartName, open, onClose, onBlocked }: Props) {
	const titleId = useId();
	const [reason, setReason] = useState<ReportReason | "">("");
	const [detail, setDetail] = useState("");
	const [alsoBlock, setAlsoBlock] = useState(false);
	const [errors, setErrors] = useState<ReportFieldErrors>({});
	const [notice, setNotice] = useState<Notice>(null);
	const [sending, setSending] = useState(false);
	const [phase, setPhase] = useState<Phase>({ kind: "form" });
	const signInHref = `/sign-in?next=${encodeURIComponent(`/inbox/${inquiryId}`)}`;

	function close() {
		onClose();
		setReason("");
		setDetail("");
		setAlsoBlock(false);
		setErrors({});
		setNotice(null);
		setPhase({ kind: "form" });
	}

	async function block(): Promise<string | null> {
		try {
			const res = await fetch(`/api/inquiries/${inquiryId}/block`, { method: "POST" });
			if (res.status === 200) {
				const data: BlockResponse = await res.json();
				if (data.blockedByMe) onBlocked();
				return null;
			}
			return res.status === 409 ? NOT_LINKED_TEXT : blockFailedText(counterpartName);
		} catch {
			return blockFailedText(counterpartName);
		}
	}

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const checked = validateNewReport({ reason, detail });
		if (!checked.ok) {
			setErrors(checked.errors);
			return;
		}
		setErrors({});
		setNotice(null);
		setSending(true);
		try {
			const res = await fetch(`/api/inquiries/${inquiryId}/report`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(checked.value),
			});
			if (res.status === 201) {
				const note = alsoBlock ? await block() : null;
				setPhase({ kind: "sent", note });
				return;
			}
			const body: Partial<ReportApiError> = await res.json().catch(() => ({}));
			if (res.status === 400 && body.fields) setErrors(body.fields);
			else if (res.status === 401) setNotice({ text: "Your session ended.", signIn: true });
			else if (res.status === 404) setNotice({ text: GONE_TEXT, signIn: false });
			else if (res.status === 429) setNotice({ text: RATE_LIMITED_TEXT, signIn: false });
			else setNotice({ text: FAILED_TEXT, signIn: false });
		} catch {
			setNotice({ text: FAILED_TEXT, signIn: false });
		} finally {
			setSending(false);
		}
	}

	return (
		<Dialog open={open} onClose={close} aria-labelledby={titleId} fullWidth maxWidth="sm">
			<DialogTitle id={titleId}>Report conversation</DialogTitle>
			{phase.kind === "sent" ? (
				<>
					<DialogContent className={styles.content}>
						<Typography component="p" variant="body1">
							{THANKS_TEXT}
						</Typography>
						{phase.note && <Alert severity="info">{phase.note}</Alert>}
					</DialogContent>
					<DialogActions>
						<Button variant="contained" onClick={close} className={styles.button}>
							Done
						</Button>
					</DialogActions>
				</>
			) : (
				<form noValidate onSubmit={onSubmit} aria-labelledby={titleId}>
					<DialogContent className={styles.content}>
						<Typography component="p" variant="body2" className={styles.lead}>
							Reports go to the Iskawt team. {counterpartName} isn&apos;t told.
						</Typography>
						<FormControl component="fieldset" error={Boolean(errors.reason)}>
							<FormLabel component="legend">Reason</FormLabel>
							<RadioGroup
								name="reason"
								value={reason}
								onChange={(e) => {
									const next = REASONS.find((r) => r === e.target.value);
									if (next) setReason(next);
								}}
							>
								{REASONS.map((r) => (
									<FormControlLabel key={r} value={r} control={<Radio />} label={reportReasonLabels[r]} className={styles.option} />
								))}
							</RadioGroup>
							{errors.reason && <FormHelperText>{errors.reason}</FormHelperText>}
						</FormControl>
						<TextField
							label="Details (optional)"
							name="detail"
							multiline
							minRows={3}
							fullWidth
							value={detail}
							onChange={(e) => setDetail(e.target.value)}
							error={Boolean(errors.detail)}
							helperText={errors.detail ?? `${[...detail].length}/${REPORT_DETAIL_MAX}`}
						/>
						<FormControlLabel
							control={<Checkbox checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />}
							label={`Also block ${counterpartName}`}
							className={styles.option}
						/>
						{notice && (
							<Alert severity="error">
								{notice.text}
								{notice.signIn && (
									<>
										{" "}
										<Link href={signInHref} className={styles.link}>
											Sign in again
										</Link>
									</>
								)}
							</Alert>
						)}
					</DialogContent>
					<DialogActions>
						<Button variant="text" onClick={close} disabled={sending} className={styles.button}>
							Cancel
						</Button>
						<Button type="submit" variant="contained" disabled={sending} className={styles.button}>
							{sending ? "Sending…" : "Send report"}
						</Button>
					</DialogActions>
				</form>
			)}
		</Dialog>
	);
}
```

The "group named Reason" test relies on the fieldset and legend. If MUI's `FormControl component="fieldset"` doesn't give the fieldset an accessible name, add `aria-labelledby` pointing at the legend's id from a second `useId`. Don't change the test.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm exec jest "ReportDialog"`. Expected: PASS. Then run `pnpm typecheck` and `pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add app/_components/ReportDialog.tsx app/_components/ReportDialog.module.scss app/_components/ReportDialog.test.tsx
git commit -m "feat(safety-ui): report dialog with an optional block

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `ThreadMenu`

**Files:**
- Create: `app/_components/ThreadMenu.tsx`, `app/_components/ThreadMenu.module.scss`
- Test: `app/_components/ThreadMenu.test.tsx`

**Interfaces:**
- Produces:

```tsx
export default function ThreadMenu(props: {
	counterpartName: string;
	blockedByMe: boolean;
	disabled: boolean;
	triggerRef: Ref<HTMLButtonElement>;
	onReport: () => void;
	onBlock: () => void;
	onUnblock: () => void;
}): JSX.Element;
```

Choosing an item closes the menu and calls the callback. Focus is **not** restored to the trigger in that case, because the caller decides where focus goes next. Escape or a click outside closes the menu and returns focus to the trigger.

- [ ] **Step 1: Write the failing tests**

Create `app/_components/ThreadMenu.test.tsx`:

```tsx
import { createRef } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThreadMenu from "@/app/_components/ThreadMenu";
import { renderWithTheme } from "@/app/_components/testing";

const onReport = jest.fn();
const onBlock = jest.fn();
const onUnblock = jest.fn();
beforeEach(() => {
	onReport.mockReset();
	onBlock.mockReset();
	onUnblock.mockReset();
});
const props = { counterpartName: "Demo Host A", blockedByMe: false, disabled: false, triggerRef: createRef<HTMLButtonElement>(), onReport, onBlock, onUnblock };
const more = () => screen.getByRole("button", { name: "More" });

it("is a labelled menu button, closed at first", () => {
	renderWithTheme(<ThreadMenu {...props} />);
	expect(more()).toHaveAttribute("aria-haspopup", "menu");
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("offers Report and Block, and calls back on choice", async () => {
	renderWithTheme(<ThreadMenu {...props} />);
	await userEvent.click(more());
	expect(screen.getByRole("menuitem", { name: "Report conversation" })).toBeInTheDocument();
	await userEvent.click(screen.getByRole("menuitem", { name: "Block Demo Host A" }));
	expect(onBlock).toHaveBeenCalledTimes(1);
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	await userEvent.click(more());
	await userEvent.click(screen.getByRole("menuitem", { name: "Report conversation" }));
	expect(onReport).toHaveBeenCalledTimes(1);
});

it("offers Unblock instead of Block when you've blocked them", async () => {
	renderWithTheme(<ThreadMenu {...props} blockedByMe />);
	await userEvent.click(more());
	expect(screen.queryByRole("menuitem", { name: "Block Demo Host A" })).not.toBeInTheDocument();
	await userEvent.click(screen.getByRole("menuitem", { name: "Unblock Demo Host A" }));
	expect(onUnblock).toHaveBeenCalledTimes(1);
});

it("Escape closes the menu and returns focus to More", async () => {
	renderWithTheme(<ThreadMenu {...props} />);
	await userEvent.click(more());
	await userEvent.keyboard("{Escape}");
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	expect(more()).toHaveFocus();
});

it("exposes the trigger through triggerRef, and can be disabled", () => {
	const triggerRef = createRef<HTMLButtonElement>();
	renderWithTheme(<ThreadMenu {...props} triggerRef={triggerRef} disabled />);
	expect(triggerRef.current).toBe(more());
	expect(more()).toBeDisabled();
});
```

MUI's Menu may leave the closed `menu` mounted during its exit transition. If `queryByRole("menu")` is still found right after a choice, use `await waitForElementToBeRemoved(() => screen.queryByRole("menu"))` in that test instead. Don't drop the assertion.

Run: `pnpm exec jest "ThreadMenu"`. Expected: FAIL.

- [ ] **Step 2: Styles**

Create `app/_components/ThreadMenu.module.scss`:

```scss
.trigger,
.item {
	min-height: 44px;
}
```

- [ ] **Step 3: Implement**

Create `app/_components/ThreadMenu.tsx`:

```tsx
import { useId, useState, type Ref } from "react";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import styles from "./ThreadMenu.module.scss";

type Props = {
	counterpartName: string;
	blockedByMe: boolean;
	disabled: boolean;
	triggerRef: Ref<HTMLButtonElement>;
	onReport: () => void;
	onBlock: () => void;
	onUnblock: () => void;
};

// The thread's "More" menu: report, block or unblock. Choosing an item hands
// focus to whatever the caller opens next (a confirmation, a dialog), so the
// menu restores focus to its trigger only when dismissed.
export default function ThreadMenu({ counterpartName, blockedByMe, disabled, triggerRef, onReport, onBlock, onUnblock }: Props) {
	const menuId = useId();
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);

	const dismiss = () => {
		anchor?.focus();
		setAnchor(null);
	};
	const choose = (action: () => void) => () => {
		setAnchor(null);
		action();
	};

	return (
		<>
			<Button
				ref={triggerRef}
				variant="outlined"
				aria-haspopup="menu"
				aria-controls={anchor ? menuId : undefined}
				aria-expanded={anchor ? "true" : undefined}
				disabled={disabled}
				onClick={(e) => setAnchor(e.currentTarget)}
				className={styles.trigger}
			>
				More
			</Button>
			<Menu id={menuId} anchorEl={anchor} open={anchor !== null} onClose={dismiss} disableRestoreFocus>
				<MenuItem onClick={choose(onReport)} className={styles.item}>
					Report conversation
				</MenuItem>
				{blockedByMe ? (
					<MenuItem onClick={choose(onUnblock)} className={styles.item}>
						Unblock {counterpartName}
					</MenuItem>
				) : (
					<MenuItem onClick={choose(onBlock)} className={styles.item}>
						Block {counterpartName}
					</MenuItem>
				)}
			</Menu>
		</>
	);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm exec jest "ThreadMenu"`. Expected: PASS. Then run `pnpm typecheck` and `pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add app/_components/ThreadMenu.tsx app/_components/ThreadMenu.module.scss app/_components/ThreadMenu.test.tsx
git commit -m "feat(safety-ui): thread More menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `ThreadView`: follow `canReply`, block, unblock and report

**Files:**
- Modify: `app/_components/ThreadView.tsx`
- Modify: `app/_components/ThreadView.module.scss` (add `.header` and `.blocked`)
- Test: `app/_components/ThreadView.test.tsx`

**Interfaces:**
- Consumes: `ThreadMenu` (Task 2), `ReportDialog` (Task 1), `InquiryThread.canReply` and `.blockedByMe`, `MessagesResponse.canReply`, and `BlockResponse`.
- Produces: nothing new. The `ThreadView({ thread })` signature is unchanged.

- [ ] **Step 1: Update the test harness and the existing poll replies**

In `app/_components/ThreadView.test.tsx`:

1. Replace `route` and `pollCalls` with:

```tsx
// Routes fetch by endpoint: GET messages (poll), POST messages (send), POST
// status, POST/DELETE block, POST report.
type Handlers = {
	poll?: () => Promise<unknown>;
	send?: () => Promise<unknown>;
	status?: () => Promise<unknown>;
	block?: () => Promise<unknown>;
	unblock?: () => Promise<unknown>;
	report?: () => Promise<unknown>;
};
const route = (handlers: Handlers) =>
	mockFetch.mockImplementation((url: string, init?: RequestInit) => {
		const handler = url.endsWith("/status")
			? handlers.status
			: url.endsWith("/block")
				? init?.method === "DELETE"
					? handlers.unblock
					: handlers.block
				: url.endsWith("/report")
					? handlers.report
					: init?.method === "POST"
						? handlers.send
						: handlers.poll;
		return handler ? handler() : pending();
	});
const pollCalls = () =>
	mockFetch.mock.calls.filter(([url, init]: [string, RequestInit | undefined]) => url.includes("/messages") && init?.method !== "POST");
```

2. Every existing mocked **poll** reply body (`{ status: …, messages: … }`) gains `canReply`:
   - `canReply: true` when the status is `NEW` or `RESPONDED`;
   - `canReply: false` when it is `CLOSED` or `DECLINED`.

   Change nothing else in those tests. A poll reply without `canReply` now means "read-only", which is what the type says it can never be.

Run: `pnpm exec jest "ThreadView"`. Expected: PASS. Only the fixtures changed.

- [ ] **Step 2: Write the failing tests**

Append to `app/_components/ThreadView.test.tsx`:

```tsx
const blockedThread = { ...demoThread, canReply: false, canClose: false, canDecline: false, blockedByMe: true };
const otherSideBlocked = { ...demoThread, canReply: false, canClose: false, canDecline: false, blockedByMe: false };
const openMenu = () => user().click(screen.getByRole("button", { name: "More" }));

describe("read-only from canReply", () => {
	it("a thread the other side blocked reads as closed, with no hint of a block", () => {
		renderWithTheme(<ThreadView thread={otherSideBlocked} />);
		expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
		expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Close conversation" })).not.toBeInTheDocument();
		expect(screen.queryByText(/blocked/i)).not.toBeInTheDocument();
	});

	it("a poll saying canReply false makes an open thread read-only, and polling continues", async () => {
		mockFetch.mockResolvedValue(reply(200, { status: "RESPONDED", canReply: false, messages: [] }));
		renderWithTheme(<ThreadView thread={demoThread} />);
		await tick(15);
		expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
		expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Close conversation" })).not.toBeInTheDocument();
		await tick(15);
		expect(pollCalls()).toHaveLength(2);
	});

	it("keeps polling while read-only on an open status, and brings the reply box back when canReply returns", async () => {
		mockFetch.mockResolvedValue(reply(200, { status: "RESPONDED", canReply: true, messages: [] }));
		renderWithTheme(<ThreadView thread={otherSideBlocked} />);
		await tick(15);
		expect(screen.getByLabelText("Reply")).toBeEnabled();
		expect(screen.queryByText("This conversation is closed.")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Close conversation" })).toBeInTheDocument();
	});
});

describe("blocking", () => {
	it("shows 'You blocked' with Unblock and no reply box", () => {
		renderWithTheme(<ThreadView thread={blockedThread} />);
		expect(screen.getByText("You blocked Demo Host A.")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Unblock" })).toBeInTheDocument();
		expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
		expect(screen.queryByText("This conversation is closed.")).not.toBeInTheDocument();
	});

	it("confirms in the page, blocks, then shows and focuses the blocked notice", async () => {
		route({ block: () => Promise.resolve(reply(200, { blockedByMe: true })) });
		renderWithTheme(<ThreadView thread={demoThread} />);
		await openMenu();
		await user().click(screen.getByRole("menuitem", { name: "Block Demo Host A" }));
		expect(
			screen.getByText(
				"Block Demo Host A? Neither of you will be able to send messages in your conversations, and they won't be able to send you new inquiries. They won't be told.",
			),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Yes, block Demo Host A" })).toHaveFocus();
		expect(mockFetch).not.toHaveBeenCalled();
		await user().click(screen.getByRole("button", { name: "Yes, block Demo Host A" }));
		await tick(0);
		expect(mockFetch).toHaveBeenCalledWith("/api/inquiries/inq_demo/block", expect.objectContaining({ method: "POST" }));
		expect(screen.getByText("You blocked Demo Host A.")).toHaveFocus();
		expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Close conversation" })).not.toBeInTheDocument();
	});

	it("cancelling the block sends nothing and returns focus to More", async () => {
		renderWithTheme(<ThreadView thread={demoThread} />);
		await openMenu();
		await user().click(screen.getByRole("menuitem", { name: "Block Demo Host A" }));
		await user().click(screen.getByRole("button", { name: "Cancel" }));
		expect(mockFetch).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "More" })).toHaveFocus();
		expect(screen.getByLabelText("Reply")).toBeInTheDocument();
	});

	it("on 409 NOT_LINKED explains and changes nothing", async () => {
		route({ block: () => Promise.resolve(reply(409, { error: "NOT_LINKED" })) });
		renderWithTheme(<ThreadView thread={demoThread} />);
		await openMenu();
		await user().click(screen.getByRole("menuitem", { name: "Block Demo Host A" }));
		await user().click(screen.getByRole("button", { name: "Yes, block Demo Host A" }));
		await tick(0);
		expect(screen.getByRole("alert")).toHaveTextContent("You can block this host once they've joined Iskawt.");
		expect(screen.getByLabelText("Reply")).toBeEnabled();
		expect(screen.queryByText("You blocked Demo Host A.")).not.toBeInTheDocument();
	});

	it("can block a closed thread", async () => {
		route({ block: () => Promise.resolve(reply(200, { blockedByMe: true })) });
		renderWithTheme(<ThreadView thread={{ ...demoThread, status: "CLOSED", canReply: false, canClose: false }} />);
		await openMenu();
		await user().click(screen.getByRole("menuitem", { name: "Block Demo Host A" }));
		await user().click(screen.getByRole("button", { name: "Yes, block Demo Host A" }));
		await tick(0);
		expect(screen.getByText("You blocked Demo Host A.")).toBeInTheDocument();
	});
});

describe("unblocking", () => {
	it("clears the notice and asks the server whether replies are allowed again", async () => {
		route({
			unblock: () => Promise.resolve(reply(200, { blockedByMe: false })),
			poll: () => Promise.resolve(reply(200, { status: "RESPONDED", canReply: true, messages: [] })),
		});
		renderWithTheme(<ThreadView thread={blockedThread} />);
		await user().click(screen.getByRole("button", { name: "Unblock" }));
		await tick(0);
		expect(mockFetch).toHaveBeenCalledWith("/api/inquiries/inq_demo/block", expect.objectContaining({ method: "DELETE" }));
		expect(pollCalls()).toHaveLength(1);
		expect(screen.queryByText("You blocked Demo Host A.")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Reply")).toBeEnabled();
		expect(screen.getByRole("button", { name: "More" })).toHaveFocus();
	});

	it("while the other side still blocks: the thread reads as closed, never a reply box", async () => {
		route({
			unblock: () => Promise.resolve(reply(200, { blockedByMe: false })),
			poll: () => Promise.resolve(reply(200, { status: "RESPONDED", canReply: false, messages: [] })),
		});
		renderWithTheme(<ThreadView thread={blockedThread} />);
		await user().click(screen.getByRole("button", { name: "Unblock" }));
		await tick(0);
		expect(screen.queryByText("You blocked Demo Host A.")).not.toBeInTheDocument();
		expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
		expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
	});

	it("is offered in the More menu too", async () => {
		route({ unblock: () => Promise.resolve(reply(200, { blockedByMe: false })) });
		renderWithTheme(<ThreadView thread={blockedThread} />);
		await openMenu();
		await user().click(screen.getByRole("menuitem", { name: "Unblock Demo Host A" }));
		await tick(0);
		expect(mockFetch).toHaveBeenCalledWith("/api/inquiries/inq_demo/block", expect.objectContaining({ method: "DELETE" }));
	});
});

describe("reporting", () => {
	it("opens the dialog from the menu; Also block applies the blocked state", async () => {
		route({
			report: () => Promise.resolve(reply(201, { id: "rep_1" })),
			block: () => Promise.resolve(reply(200, { blockedByMe: true })),
		});
		renderWithTheme(<ThreadView thread={demoThread} />);
		await openMenu();
		await user().click(screen.getByRole("menuitem", { name: "Report conversation" }));
		const dialog = screen.getByRole("dialog", { name: "Report conversation" });
		await user().click(within(dialog).getByLabelText("Spam"));
		await user().click(within(dialog).getByLabelText("Also block Demo Host A"));
		await user().click(within(dialog).getByRole("button", { name: "Send report" }));
		await tick(0);
		expect(within(dialog).getByText("Thanks. Someone from Iskawt will look at this.")).toBeInTheDocument();
		await user().click(within(dialog).getByRole("button", { name: "Done" }));
		await tick(1);
		expect(screen.getByText("You blocked Demo Host A.")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "More" })).toHaveFocus();
		expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
	});
});
```

The menu and dialog use MUI transitions. Under fake timers, a `tick(1)` after closing lets them finish. If an element is still mounted mid-exit, add a `tick(1)` before that assertion. Don't loosen the assertion.

Run: `pnpm exec jest "ThreadView"`. Expected: the new tests FAIL. There is no More button and no `canReply` handling yet.

- [ ] **Step 3: Styles**

Append to `app/_components/ThreadView.module.scss`:

```scss
// The More menu sits at the top right of the conversation.
.header {
	display: flex;
	justify-content: flex-end;
}

.blocked {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: space(3);
}
```

- [ ] **Step 4: Implement**

In `app/_components/ThreadView.tsx`:

**4a. Imports.** Add these, and add `BlockResponse` to the type import from `@/app/_lib/types`:

```tsx
import ReportDialog from "@/app/_components/ReportDialog";
import ThreadMenu from "@/app/_components/ThreadMenu";
```

**4b. Copy and confirmation.** Add `const NOT_LINKED_TEXT = "You can block this host once they've joined Iskawt.";` beside the other texts. Change `type Action = "close" | "decline";` to `type Action = "close" | "decline" | "block";` and replace the `CONFIRM` constant with:

```tsx
function confirmCopy(action: Action, name: string): { question: string; yes: string } {
	switch (action) {
		case "close":
			return { question: "Close this conversation? Neither of you can send more messages.", yes: "Yes, close it" };
		case "decline":
			return { question: "Decline this inquiry? The renter will see it's declined and can't reply.", yes: "Yes, decline" };
		case "block":
			return {
				question: `Block ${name}? Neither of you will be able to send messages in your conversations, and they won't be able to send you new inquiries. They won't be told.`,
				yes: `Yes, block ${name}`,
			};
	}
}
```

**4c. The component comment.** Replace the comment above `export default function ThreadView` with:

```tsx
// The live part of a thread: messages, the poller, the reply box, the status
// actions and the safety menu. Whether you can write is the server's call
// (canReply, refreshed by every poll); a block you made is shown as such, any
// other read-only state reads as "closed", so nobody learns they were blocked.
```

**4d. State.** After `const [stopped, setStopped] = useState(false);` add:

```tsx
	const [sendable, setSendable] = useState(thread.canReply);
	const [blockedByMe, setBlockedByMe] = useState(thread.blockedByMe);
	const [reporting, setReporting] = useState(false);
```

After `const pollNow = …` add:

```tsx
	const moreRef = useRef<HTMLButtonElement>(null);
	const blockedRef = useRef<HTMLParagraphElement>(null);
	const focusBlocked = useRef(false);
	const focusMore = useRef(false);
```

**4e. Derived flags.** Replace `const open = isOpenStatus(status);` with:

```tsx
	// statusOpen keeps the poller running while a block or an unverified host
	// makes the thread read-only, so it notices when that lifts.
	const statusOpen = isOpenStatus(status);
	const open = statusOpen && sendable;
```

`canDecline` and `canClose` stay as they are, derived from `open`.

**4f. Focus effects.** In the effect that handles `confirming`, replace the `else if (returnFocusTo.current)` branch with:

```tsx
		} else if (returnFocusTo.current) {
			const target = returnFocusTo.current === "close" ? closeRef : returnFocusTo.current === "decline" ? declineRef : moreRef;
			target.current?.focus();
			returnFocusTo.current = null;
		}
```

Add, after the `focusClosed` effect:

```tsx
	// After a confirmed block, focus the notice that replaced the reply box.
	useEffect(() => {
		if (blockedByMe && focusBlocked.current) {
			focusBlocked.current = false;
			blockedRef.current?.focus();
		}
	}, [blockedByMe]);

	// After unblocking, give focus back to More, once it's enabled again
	// (it's disabled while the request is in flight).
	useEffect(() => {
		if (!acting && focusMore.current) {
			focusMore.current = false;
			moreRef.current?.focus();
		}
	}, [acting]);
```

**4g. The poller.**
- In the polling effect, change `if (!open || stopped) return;` to `if (!statusOpen || stopped) return;`, and the dependency list `[id, open, stopped]` to `[id, statusOpen, stopped]`.
- In the 200 branch, after `setStatus(data.status);`, add `setSendable(data.canReply);`.

**4h. Block and unblock.** Rename the existing `onConfirm(action: Action)` to `onStatusChange(action: "close" | "decline")`. Its body is unchanged. Then add:

```tsx
	async function onBlock() {
		setActing(true);
		try {
			const res = await fetch(`/api/inquiries/${id}/block`, { method: "POST" });
			if (res.status === 200) {
				const data: BlockResponse = await res.json();
				focusBlocked.current = data.blockedByMe;
				setBlockedByMe(data.blockedByMe);
				if (data.blockedByMe) setSendable(false);
				setAlert(null);
			} else if (res.status === 409) {
				setAlert({ kind: "text", text: NOT_LINKED_TEXT });
			} else if (res.status === 401) {
				setAlert({ kind: "session" });
				setStopped(true);
			} else if (res.status === 404) {
				setAlert({ kind: "gone" });
				setStopped(true);
			} else {
				setAlert({ kind: "text", text: STATUS_FAILED_TEXT });
			}
		} catch {
			setAlert({ kind: "text", text: STATUS_FAILED_TEXT });
		} finally {
			setActing(false);
			setConfirming(null);
		}
	}

	// No confirmation: unblocking takes nothing away. The server decides whether
	// replies are allowed again (the other side may still block), so ask it.
	async function onUnblock() {
		setActing(true);
		try {
			const res = await fetch(`/api/inquiries/${id}/block`, { method: "DELETE" });
			if (res.status === 200) {
				const data: BlockResponse = await res.json();
				setBlockedByMe(data.blockedByMe);
				setAlert(null);
				focusMore.current = true;
				void pollNow.current?.();
			} else if (res.status === 401) {
				setAlert({ kind: "session" });
				setStopped(true);
			} else if (res.status === 404) {
				setAlert({ kind: "gone" });
				setStopped(true);
			} else {
				setAlert({ kind: "text", text: STATUS_FAILED_TEXT });
			}
		} catch {
			setAlert({ kind: "text", text: STATUS_FAILED_TEXT });
		} finally {
			setActing(false);
		}
	}

	function onConfirm(action: Action) {
		if (action === "block") void onBlock();
		else void onStatusChange(action);
	}
```

The confirm button's `onClick` stays `() => void onConfirm(confirming)`, or simply `() => onConfirm(confirming)`.

**4i. Render.**
- Replace `const showBox = open || closedOnSend;` with `const showBox = (open || closedOnSend) && !blockedByMe;`.
- Inside `<section>`, before the messages `<ol>`, add:

```tsx
			<div className={styles.header}>
				<ThreadMenu
					counterpartName={thread.counterpartName}
					blockedByMe={blockedByMe}
					disabled={acting}
					triggerRef={moreRef}
					onReport={() => setReporting(true)}
					onBlock={() => setConfirming("block")}
					onUnblock={() => void onUnblock()}
				/>
			</div>
```

- Replace the `{!open && !closedOnSend && ( … This conversation is closed. … )}` block with:

```tsx
			{blockedByMe ? (
				<div className={styles.blocked}>
					<Typography ref={blockedRef} component="p" variant="body1" tabIndex={-1} className={styles.closed}>
						You blocked {thread.counterpartName}.
					</Typography>
					<Button variant="outlined" disabled={acting} onClick={() => void onUnblock()} className={styles.button}>
						Unblock
					</Button>
				</div>
			) : (
				!open &&
				!closedOnSend && (
					<Typography ref={closedRef} component="p" variant="body1" tabIndex={-1} className={styles.closed}>
						This conversation is closed.
					</Typography>
				)
			)}
```

- Change the actions wrapper from `{open && (` to `{(open || confirming) && (`. A block can be confirmed on a closed thread, where Close and Decline are gone.
- Inside it, replace `CONFIRM[confirming].question` and `CONFIRM[confirming].yes` with `confirmCopy(confirming, thread.counterpartName).question` and `.yes`.
- Just before `</section>`, add:

```tsx
			<ReportDialog
				inquiryId={id}
				counterpartName={thread.counterpartName}
				open={reporting}
				onClose={() => {
					setReporting(false);
					// The menu item that opened the dialog is gone; land on More.
					moreRef.current?.focus();
				}}
				onBlocked={() => {
					setBlockedByMe(true);
					setSendable(false);
				}}
			/>
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm exec jest "ThreadView|ThreadMenu|ReportDialog"`. Expected: PASS, both old tests and new.

Then run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add app/_components/ThreadView.tsx app/_components/ThreadView.module.scss app/_components/ThreadView.test.tsx
git commit -m "feat(safety-ui): thread follows canReply; block, unblock and report from the thread

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `BLOCKED` on the inquiry form

**Files:**
- Modify: `app/_components/InquiryForm.tsx` (the text constants and `errorText`)
- Test: `app/_components/InquiryForm.test.tsx` (the `it.each` of errors)

- [ ] **Step 1: Write the failing test**

In the `it.each` table of `shows the error for %i %o`, add this row:

```tsx
	[403, { error: "BLOCKED" }, "You can't send inquiries to this host."],
```

Run: `pnpm exec jest "InquiryForm"`. Expected: the new row FAILS, showing "We couldn't send that. Try again." instead.

- [ ] **Step 2: Implement**

In `app/_components/InquiryForm.tsx`, beside the other texts:

```tsx
// Neutral on purpose: never says which side blocked, or that anyone did.
const BLOCKED_TEXT = "You can't send inquiries to this host.";
```

In `errorText`, add:

```tsx
		case "BLOCKED":
			return BLOCKED_TEXT;
```

- [ ] **Step 3: Run the checks**

Run: `pnpm exec jest "InquiryForm|InquiryPanel"`, then `pnpm test`, `pnpm typecheck` and `pnpm lint`. Finish with `pnpm build` using the throwaway env from Global Constraints. Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add app/_components/InquiryForm.tsx app/_components/InquiryForm.test.tsx
git commit -m "feat(safety-ui): neutral copy when a blocked renter tries a new inquiry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
