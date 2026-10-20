# Slice 7a-2 — List Your Space Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "List your space" page. It explains what happens to an application, asks signed-out visitors to sign in, and gives signed-in users a form that posts to `POST /api/host-applications`. The header gets a link to the page.

**Architecture:**
- **`/list-your-space`** is a server component. It reads `getCurrentUser()` and renders either the sign-in prompt or `HostApplicationForm`.
- **`HostApplicationForm`** is a client component that mirrors `InquiryForm`:
  - it validates with the shared `validateNewHostApplication`;
  - its live region is rendered empty from first paint;
  - focus moves to that region once the application is sent;
  - it has the same hidden spam trap.
- **`SiteHeader`** gains a plain `Link`. The page itself has no `loading.tsx` and no `redirect()`.

**Tech Stack:** Next.js 16.4 App Router, MUI 9.5 with SCSS modules and tokens, Jest 30, React Testing Library and user-event.

**Spec:** `docs/superpowers/specs/2026-10-20-slice-7a-host-applications-design.md`, section **Page**. The 7a-1 API is on `feat/slice-7a-host-applications` (PR #27), and this branch is stacked on it. That API provides:
- `NewHostApplicationInput`, `HostApplicationFieldErrors`, `CreateHostApplicationResponse` and `HostApplicationApiError` in `types.ts`;
- `validateNewHostApplication` in `app/_lib/hostApplicationValidation.ts`;
- the limits in `app/_lib/constants/hostApplications.ts`.

## Global Constraints

- **Branch and commits.** Work on `feat/slice-7a-2-list-your-space`. It is stacked on `feat/slice-7a-host-applications` and has no upstream. Commit locally at each commit step, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push or rebase.
- **Ownership.** Every task goes to `frontend-dev`. No backend files change, and `types.ts` doesn't change.
- **Off limits:** new dependencies, `prisma/**`, lockfiles, `.env*`.
- **Styling.**
  - SCSS modules and tokens only, through `@use "../_styles/tokens" as *;`. For the route, the module sits under `app/list-your-space/`, so use `"../_styles/tokens"`.
  - No `sx`, `styled()` or `style={{}}`.
  - Touch targets are at least 44px. Every input is labelled.
  - `"use client"` goes only on `HostApplicationForm`.
- **No `loading.tsx` and no `redirect()`** for this route. A signed-out visitor sees the page with a sign-in link.
- **Copy and values, verbatim:**
  - Page title (metadata): `List your space — Iskawt`. h1: `List your space`.
  - Intro, three paragraphs:
    1. `Iskawt lists private spaces in Metro Manila for film and photo shoots: homes, studios, rooftops, cafés and warehouses.`
    2. `A person checks every space before it goes up. Rates are indicative, and Iskawt takes no payment.`
    3. `After you apply, we'll email you to talk it through.`
  - Signed out: the link `Sign in to apply`, to `/sign-in?next=%2Flist-your-space`.
  - Form labels:
    - `Your name or business name`
    - `Space type`
    - `City`
    - `Area`, with the hint `Like Poblacion or Kapitolyo.`
    - `Address`, with the hint `Only the Iskawt team sees this. Listings show just the area and city.`
    - `About the space`
    - `Hourly rate (optional)`, with the hint `Indicative, in pesos per hour. Nothing is charged here.`
    - the checkbox `This space is mine to list, or I have the owner's permission.`
  - Buttons: `Send application`, which reads `Sending…` while it sends.
  - Sent: `Thanks. We'll email you at {email} after we've had a look.`
  - Errors:
    - 401: `Your session ended.` plus the link `Sign in again`, to `/sign-in?next=%2Flist-your-space`.
    - 429: `You've sent a lot of applications today. Try again tomorrow.`
    - anything else: `We couldn't send that. Try again.`
  - Header: the link `List your space`, to `/list-your-space`. It shows both signed in and signed out.
- **Rate input (carried over from 7a-1 review).** People type "1,500" or "₱1500". Strip `₱`, commas and spaces from the rate before both client validation and posting. Use `inputMode: "numeric"`, not `type="number"`.
- **TypeScript strict.** No `any`, no `@ts-ignore`, no non-null `!`. Narrow select values by lookup, not with `as`.
- **Tests first.** Watch each new test fail before implementing.
- **Commands.** Run one file with `pnpm exec jest "<path regex>"`. Then run `pnpm typecheck` and `pnpm lint`. At the end, run `pnpm build` with `BETTER_AUTH_SECRET=throwaway-dev-secret-0123456789abcdef BETTER_AUTH_URL=http://localhost:3000`.

## Review Focus

1. **A rate typed the way people write money.** "1,500", "₱1,500" and " 1500 " are each accepted and posted as `"1500"`. "12.5" still shows `Enter a whole number of pesos.` Test: Task 1.
2. **The address is only sent, never shown back.** The sent state shows only the thanks text and the user's own email. It never shows the address or the other answers. Test: Task 1.
3. **The session expires mid-form.** On a 401, the typed values are kept and a sign-in link points back to this page. Test: Task 1.
4. **Server field errors on fields the client accepted.** Example: a 400 with `{ applicantName: "Use your own name or your business's name." }`. The error appears under that field, and the form stays editable. Test: Task 1.
5. **A signed-out visitor follows a deep link.** They see the intro and `Sign in to apply` with the right `next`. No form or redirect is rendered, and the page returns 200. Test: Task 2.

---

### Task 1: `HostApplicationForm`

**Files:**
- Create: `app/_components/HostApplicationForm.tsx`, `app/_components/HostApplicationForm.module.scss`
- Test: `app/_components/HostApplicationForm.test.tsx`

**Interfaces:**
- Consumes:
  - `validateNewHostApplication(input: unknown)`;
  - the `cityLabels` and `spaceTypeLabels` records (`Record<City, string>`, `Record<SpaceType, string>`) from `@/app/_lib/constants/labels`;
  - the `City` and `SpaceType` value objects from `@/generated/prisma/enums`;
  - the types `HostApplicationApiError` and `HostApplicationFieldErrors`.
- Produces: `export default function HostApplicationForm({ email }: { email: string }): JSX.Element`. The `email` is the signed-in user's own address, shown only in the thanks text.

- [ ] **Step 1: Write the failing tests**

Create `app/_components/HostApplicationForm.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HostApplicationForm from "@/app/_components/HostApplicationForm";
import { renderWithTheme } from "@/app/_components/testing";

const mockFetch = jest.fn();
beforeEach(() => {
	mockFetch.mockReset();
	global.fetch = mockFetch;
});
const reply = (status: number, body: unknown) =>
	mockFetch.mockResolvedValue({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) });

const email = "demo-host@example.invalid";
const ADDRESS = "[UNIT NO.] [BUILDING NAME], Demo Street, Poblacion, Makati";

async function choose(label: string, option: string) {
	await userEvent.click(screen.getByRole("combobox", { name: label }));
	await userEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: option }));
}

async function fillValid() {
	await userEvent.type(screen.getByLabelText("Your name or business name"), "Demo Host");
	await choose("Space type", "Studio");
	await choose("City", "Makati");
	await userEvent.type(screen.getByLabelText("Area"), "Poblacion");
	await userEvent.type(screen.getByLabelText("Address"), ADDRESS);
	await userEvent.type(screen.getByLabelText("About the space"), "A daylight studio with a white cyc and blackout curtains.");
	await userEvent.click(screen.getByLabelText("This space is mine to list, or I have the owner's permission."));
}
const submit = () => userEvent.click(screen.getByRole("button", { name: "Send application" }));
const posted = () => JSON.parse(mockFetch.mock.calls[0][1].body);

it("labels every field, with the privacy and rate hints", () => {
	renderWithTheme(<HostApplicationForm email={email} />);
	for (const label of ["Your name or business name", "Area", "Address", "About the space", "Hourly rate (optional)"]) {
		expect(screen.getByLabelText(label)).toBeInTheDocument();
	}
	expect(screen.getByRole("combobox", { name: "Space type" })).toBeInTheDocument();
	expect(screen.getByRole("combobox", { name: "City" })).toBeInTheDocument();
	expect(screen.getByText("Only the Iskawt team sees this. Listings show just the area and city.")).toBeInTheDocument();
	expect(screen.getByText("Indicative, in pesos per hour. Nothing is charged here.")).toBeInTheDocument();
	expect(screen.getByText("Like Poblacion or Kapitolyo.")).toBeInTheDocument();
	expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

it("hides the spam trap from people and assistive tech", () => {
	renderWithTheme(<HostApplicationForm email={email} />);
	const trap = document.getElementById("application-website");
	expect(trap).toHaveAttribute("tabindex", "-1");
	expect(trap?.closest("[aria-hidden='true']")).not.toBeNull();
});

it("offers only the Metro Manila cities", async () => {
	renderWithTheme(<HostApplicationForm email={email} />);
	await userEvent.click(screen.getByRole("combobox", { name: "City" }));
	expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(17);
});

it("validates on the client with the shared rules and doesn't post", async () => {
	renderWithTheme(<HostApplicationForm email={email} />);
	await submit();
	expect(screen.getByText("Enter your name.")).toBeInTheDocument();
	expect(screen.getByText("Choose a city.")).toBeInTheDocument();
	expect(screen.getByText("Confirm that this space is yours to list.")).toBeInTheDocument();
	expect(mockFetch).not.toHaveBeenCalled();
});

it("posts the application and thanks the user by their own email, moving focus there", async () => {
	reply(201, { received: true });
	renderWithTheme(<HostApplicationForm email={email} />);
	await fillValid();
	await submit();
	const status = await screen.findByRole("status");
	expect(status).toHaveTextContent("Thanks. We'll email you at demo-host@example.invalid after we've had a look.");
	expect(status).toHaveFocus();
	expect(mockFetch).toHaveBeenCalledWith("/api/host-applications", expect.objectContaining({ method: "POST" }));
	expect(posted()).toMatchObject({
		applicantName: "Demo Host",
		spaceType: "STUDIO",
		city: "MAKATI",
		areaName: "Poblacion",
		address: ADDRESS,
		hourlyRate: "",
		confirmsRightToList: true,
		website: "",
	});
	expect(screen.queryByText(ADDRESS)).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "Send application" })).not.toBeInTheDocument();
});

it.each([
	["1,500", "1500"],
	["₱1,500", "1500"],
	[" 1500 ", "1500"],
])("accepts a rate typed as %p and posts %p", async (typed, sent) => {
	reply(201, { received: true });
	renderWithTheme(<HostApplicationForm email={email} />);
	await fillValid();
	await userEvent.type(screen.getByLabelText("Hourly rate (optional)"), typed);
	await submit();
	await screen.findByText(/Thanks\./);
	expect(posted().hourlyRate).toBe(sent);
});

it("still rejects a fractional rate", async () => {
	renderWithTheme(<HostApplicationForm email={email} />);
	await fillValid();
	await userEvent.type(screen.getByLabelText("Hourly rate (optional)"), "12.5");
	await submit();
	expect(screen.getByText("Enter a whole number of pesos.")).toBeInTheDocument();
	expect(mockFetch).not.toHaveBeenCalled();
});

it("shows a server field error under its field and keeps the form editable", async () => {
	reply(400, { error: "VALIDATION", fields: { applicantName: "Use your own name or your business's name." } });
	renderWithTheme(<HostApplicationForm email={email} />);
	await fillValid();
	await submit();
	expect(await screen.findByText("Use your own name or your business's name.")).toBeInTheDocument();
	expect(screen.getByLabelText("Your name or business name")).toBeEnabled();
	expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

it.each([
	[429, { error: "RATE_LIMITED" }, "You've sent a lot of applications today. Try again tomorrow."],
	[500, {}, "We couldn't send that. Try again."],
])("shows the error for %i and keeps the values", async (status, body, text) => {
	reply(status, body);
	renderWithTheme(<HostApplicationForm email={email} />);
	await fillValid();
	await submit();
	expect(await screen.findByText(text)).toBeInTheDocument();
	expect(screen.getByLabelText("Address")).toHaveValue(ADDRESS);
	expect(screen.getByRole("button", { name: "Send application" })).toBeEnabled();
});

it("on 401 keeps the values and links back to sign-in for this page", async () => {
	reply(401, { error: "UNAUTHENTICATED" });
	renderWithTheme(<HostApplicationForm email={email} />);
	await fillValid();
	await submit();
	expect(await screen.findByText(/Your session ended\./)).toBeInTheDocument();
	expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/sign-in?next=%2Flist-your-space");
	expect(screen.getByLabelText("Address")).toHaveValue(ADDRESS);
});

it("on a network failure says so; the button is disabled while sending", async () => {
	let fail: (e: Error) => void = () => {};
	mockFetch.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
	renderWithTheme(<HostApplicationForm email={email} />);
	await fillValid();
	await submit();
	expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
	fail(new Error("offline"));
	expect(await screen.findByText("We couldn't send that. Try again.")).toBeInTheDocument();
});
```

The MUI `TextField select` renders a `combobox` named by its label, and a `listbox` when open. That's the pattern the existing `InquiryForm` production-type select uses. If the role names differ in this MUI version, match `InquiryForm.test.tsx`'s way of choosing an option. Don't drop the assertions.

Run: `pnpm exec jest "HostApplicationForm"`. Expected: FAIL. The module doesn't exist yet.

- [ ] **Step 2: Styles**

Create `app/_components/HostApplicationForm.module.scss`:

```scss
@use "../_styles/tokens" as *;

.root {
	display: flex;
	flex-direction: column;
}

.form {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: space(4);
}

// Type and city side by side when there's room, stacked when there isn't.
.pair {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
	gap: space(4);
}

.check,
.submit {
	min-height: 44px;
}

.submit {
	align-self: flex-start;
}

// The live region before anything is sent: empty and takes no space, but
// stays in the accessibility tree so its later text is announced.
.status {
	margin: 0;
}

.sent {
	margin: 0;
	padding: space(4);
	border: 1px solid $color-hairline;
	border-radius: $radius-md;
	background: $color-paper;
}

.link {
	display: inline-flex;
	align-items: center;
	min-height: 44px;
	color: inherit;
}

// Spam trap: off-screen and out of the tab order. Layout measures, not tokens.
.trap {
	position: absolute;
	left: -10000px;
	width: 1px;
	height: 1px;
	overflow: hidden;
}
```

- [ ] **Step 3: Implement**

Create `app/_components/HostApplicationForm.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { cityLabels, spaceTypeLabels } from "@/app/_lib/constants/labels";
import { validateNewHostApplication } from "@/app/_lib/hostApplicationValidation";
import { City, SpaceType } from "@/generated/prisma/enums";
import type { HostApplicationApiError, HostApplicationFieldErrors } from "@/app/_lib/types";
import styles from "./HostApplicationForm.module.scss";

const CITIES = Object.values(City);
const SPACE_TYPES = Object.values(SpaceType);
const SIGN_IN_HREF = `/sign-in?next=${encodeURIComponent("/list-your-space")}`;
const SEND_FAILED_TEXT = "We couldn't send that. Try again.";
const RATE_LIMITED_TEXT = "You've sent a lot of applications today. Try again tomorrow.";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "signed-out" } | { kind: "error"; message: string };

// "₱1,500" and " 1 500 " are how people write money; the validator wants digits.
const cleanRate = (value: string) => value.replace(/[₱,\s]/g, "");

// Apply to list a space. Nothing typed here is shown back: after sending, only
// the thanks with the user's own email. The address goes to the Iskawt team only.
export default function HostApplicationForm({ email }: { email: string }) {
	const [applicantName, setApplicantName] = useState("");
	const [spaceType, setSpaceType] = useState<SpaceType | "">("");
	const [city, setCity] = useState<City | "">("");
	const [areaName, setAreaName] = useState("");
	const [address, setAddress] = useState("");
	const [description, setDescription] = useState("");
	const [hourlyRate, setHourlyRate] = useState("");
	const [confirmsRightToList, setConfirms] = useState(false);
	const [website, setWebsite] = useState("");
	const [fieldErrors, setFieldErrors] = useState<HostApplicationFieldErrors>({});
	const [state, setState] = useState<State>({ kind: "idle" });
	const statusRef = useRef<HTMLParagraphElement>(null);

	const sent = state.kind === "sent";
	const sending = state.kind === "sending";

	// The form unmounts on "sent"; without this, focus drops to <body>.
	useEffect(() => {
		if (sent) statusRef.current?.focus();
	}, [sent]);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (sending) return;
		// The rate stays a string: the shared validator parses it, as the route does.
		const input = {
			applicantName,
			spaceType,
			city,
			areaName,
			address,
			description,
			hourlyRate: cleanRate(hourlyRate),
			confirmsRightToList,
			website,
		};
		const checked = validateNewHostApplication(input);
		if (!checked.ok) {
			setFieldErrors(checked.errors);
			setState({ kind: "idle" });
			return;
		}
		setFieldErrors({});
		setState({ kind: "sending" });
		try {
			const res = await fetch("/api/host-applications", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			if (res.status === 201) {
				setState({ kind: "sent" });
				return;
			}
			const body: Partial<HostApplicationApiError> = await res.json().catch(() => ({}));
			if (res.status === 401 || body.error === "UNAUTHENTICATED") setState({ kind: "signed-out" });
			else if (body.error === "VALIDATION" && body.fields && Object.keys(body.fields).length > 0) {
				setFieldErrors(body.fields);
				setState({ kind: "idle" });
			} else if (res.status === 429 || body.error === "RATE_LIMITED") setState({ kind: "error", message: RATE_LIMITED_TEXT });
			else setState({ kind: "error", message: SEND_FAILED_TEXT });
		} catch {
			setState({ kind: "error", message: SEND_FAILED_TEXT });
		}
	}

	const field = (key: keyof HostApplicationFieldErrors, hint?: string) => ({
		name: key,
		error: Boolean(fieldErrors[key]),
		helperText: fieldErrors[key] ?? hint,
		disabled: sending,
		fullWidth: true,
	});

	return (
		<div className={styles.root}>
			{/* Rendered empty from first paint: a live region that arrives already
			    filled is not announced by some screen readers. */}
			<p role="status" ref={statusRef} tabIndex={-1} className={sent ? styles.sent : styles.status}>
				{sent && `Thanks. We'll email you at ${email} after we've had a look.`}
			</p>
			{!sent && (
				<form noValidate onSubmit={onSubmit} className={styles.form}>
					{state.kind === "error" && <Alert severity="error">{state.message}</Alert>}
					{state.kind === "signed-out" && (
						<Alert severity="error">
							Your session ended.{" "}
							<Link href={SIGN_IN_HREF} className={styles.link}>
								Sign in again
							</Link>
						</Alert>
					)}
					<TextField
						label="Your name or business name"
						autoComplete="name"
						value={applicantName}
						onChange={(e) => setApplicantName(e.target.value)}
						{...field("applicantName")}
					/>
					<div className={styles.pair}>
						<TextField
							select
							label="Space type"
							value={spaceType}
							onChange={(e) => {
								const next = SPACE_TYPES.find((type) => type === e.target.value);
								if (next) setSpaceType(next);
							}}
							{...field("spaceType")}
						>
							{SPACE_TYPES.map((type) => (
								<MenuItem key={type} value={type}>
									{spaceTypeLabels[type]}
								</MenuItem>
							))}
						</TextField>
						<TextField
							select
							label="City"
							value={city}
							onChange={(e) => {
								const next = CITIES.find((c) => c === e.target.value);
								if (next) setCity(next);
							}}
							{...field("city")}
						>
							{CITIES.map((c) => (
								<MenuItem key={c} value={c}>
									{cityLabels[c]}
								</MenuItem>
							))}
						</TextField>
					</div>
					<TextField label="Area" value={areaName} onChange={(e) => setAreaName(e.target.value)} {...field("areaName", "Like Poblacion or Kapitolyo.")} />
					<TextField
						label="Address"
						autoComplete="street-address"
						multiline
						minRows={2}
						value={address}
						onChange={(e) => setAddress(e.target.value)}
						{...field("address", "Only the Iskawt team sees this. Listings show just the area and city.")}
					/>
					<TextField
						label="About the space"
						multiline
						minRows={4}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						{...field("description")}
					/>
					<TextField
						label="Hourly rate (optional)"
						slotProps={{ htmlInput: { inputMode: "numeric" } }}
						value={hourlyRate}
						onChange={(e) => setHourlyRate(e.target.value)}
						{...field("hourlyRate", "Indicative, in pesos per hour. Nothing is charged here.")}
					/>
					<FormControl error={Boolean(fieldErrors.confirmsRightToList)}>
						<FormControlLabel
							control={<Checkbox checked={confirmsRightToList} onChange={(e) => setConfirms(e.target.checked)} disabled={sending} />}
							label="This space is mine to list, or I have the owner's permission."
							className={styles.check}
						/>
						{fieldErrors.confirmsRightToList && <FormHelperText>{fieldErrors.confirmsRightToList}</FormHelperText>}
					</FormControl>
					{/* Spam trap. People never see it; bots fill it in. */}
					<div aria-hidden="true" className={styles.trap}>
						<label htmlFor="application-website">Leave this empty</label>
						<input
							id="application-website"
							name="website"
							type="text"
							tabIndex={-1}
							autoComplete="off"
							value={website}
							onChange={(e) => setWebsite(e.target.value)}
						/>
					</div>
					<Button type="submit" variant="contained" size="large" disabled={sending} className={styles.submit}>
						{sending ? "Sending…" : "Send application"}
					</Button>
				</form>
			)}
		</div>
	);
}
```

The test expects the posted `hourlyRate` to be `""` when left empty, and `"1500"` after cleaning. The posted body is `input`, the cleaned values, so both hold.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm exec jest "HostApplicationForm"`. Expected: PASS. Then run `pnpm typecheck` and `pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add app/_components/HostApplicationForm.tsx app/_components/HostApplicationForm.module.scss app/_components/HostApplicationForm.test.tsx
git commit -m "feat(list-your-space): host application form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The `/list-your-space` page and the header link

**Files:**
- Create: `app/list-your-space/page.tsx`, `app/list-your-space/page.module.scss`
- Test: `app/list-your-space/page.test.tsx`
- Modify: `app/_components/SiteHeader.tsx`, `app/_components/SiteHeader.test.tsx`

**Interfaces:**
- Consumes: `HostApplicationForm({ email })` from Task 1, `getCurrentUser()`, and `SITE_NAME`.

- [ ] **Step 1: Write the failing tests**

Create `app/list-your-space/page.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import ListYourSpacePage, { metadata } from "@/app/list-your-space/page";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { demoUser, renderWithTheme } from "@/app/_components/testing";

jest.mock("@/app/_lib/server/currentUser", () => ({ getCurrentUser: jest.fn() }));
const mockGetUser = jest.mocked(getCurrentUser);
beforeEach(() => mockGetUser.mockReset());

it("has a page title", () => {
	expect(metadata.title).toBe("List your space — Iskawt");
});

it("explains the process to everyone", async () => {
	mockGetUser.mockResolvedValue(null);
	renderWithTheme(await ListYourSpacePage());
	expect(screen.getByRole("main")).toBeInTheDocument();
	expect(screen.getByRole("heading", { level: 1, name: "List your space" })).toBeInTheDocument();
	expect(screen.getByText(/Iskawt lists private spaces in Metro Manila/)).toBeInTheDocument();
	expect(screen.getByText("A person checks every space before it goes up. Rates are indicative, and Iskawt takes no payment.")).toBeInTheDocument();
	expect(screen.getByText("After you apply, we'll email you to talk it through.")).toBeInTheDocument();
});

it("asks a signed-out visitor to sign in, back to this page, and shows no form", async () => {
	mockGetUser.mockResolvedValue(null);
	renderWithTheme(await ListYourSpacePage());
	expect(screen.getByRole("link", { name: "Sign in to apply" })).toHaveAttribute("href", "/sign-in?next=%2Flist-your-space");
	expect(screen.queryByRole("button", { name: "Send application" })).not.toBeInTheDocument();
});

it("shows the form to a signed-in user", async () => {
	mockGetUser.mockResolvedValue(demoUser);
	renderWithTheme(await ListYourSpacePage());
	expect(screen.getByRole("button", { name: "Send application" })).toBeInTheDocument();
	expect(screen.queryByRole("link", { name: "Sign in to apply" })).not.toBeInTheDocument();
});
```

In `app/_components/SiteHeader.test.tsx`, add:

```tsx
	it("links to List your space, signed in or not", () => {
		const { unmount } = renderWithTheme(<SiteHeader user={null} />);
		expect(screen.getByRole("link", { name: "List your space" })).toHaveAttribute("href", "/list-your-space");
		unmount();
		renderWithTheme(<SiteHeader user={demoUser} />);
		expect(screen.getByRole("link", { name: "List your space" })).toHaveAttribute("href", "/list-your-space");
	});
```

Run: `pnpm exec jest "list-your-space|SiteHeader"`. Expected: FAIL.

- [ ] **Step 2: Styles**

Create `app/list-your-space/page.module.scss`:

```scss
@use "../_styles/tokens" as *;

.page {
	@include page;
}

// A readable measure for the intro and the form.
.column {
	display: flex;
	flex-direction: column;
	gap: space(4);
	max-width: 60ch;

	p {
		margin: 0;
	}
}

// The sign-in link, drawn as an outlined button. 44px tall for touch.
.action {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	align-self: flex-start;
	min-height: space(11);
	padding-inline: space(5);
	border: 1px solid $color-stamp;
	border-radius: $radius-md;
	color: $color-stamp;
	font: var(--mui-font-button);
	text-decoration: none;

	&:hover {
		background: $color-canvas;
	}

	&:focus-visible {
		outline: 2px solid $color-stamp;
		outline-offset: 2px;
	}
}
```

- [ ] **Step 3: Implement the page**

Create `app/list-your-space/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import HostApplicationForm from "@/app/_components/HostApplicationForm";
import { SITE_NAME } from "@/app/_lib/constants/site";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import styles from "./page.module.scss";

export const metadata: Metadata = { title: `List your space — ${SITE_NAME}` };

// Signed-out visitors see the page and a sign-in link, not a redirect: there
// is no loading.tsx here, and a redirect under one would turn into a 200.
export default async function ListYourSpacePage() {
	const user = await getCurrentUser();
	return (
		<Container component="main" disableGutters maxWidth={false} className={styles.page}>
			<div className={styles.column}>
				<Typography variant="displayLg" component="h1">
					List your space
				</Typography>
				<Typography component="p">
					Iskawt lists private spaces in Metro Manila for film and photo shoots: homes, studios, rooftops, cafés and warehouses.
				</Typography>
				<Typography component="p">A person checks every space before it goes up. Rates are indicative, and Iskawt takes no payment.</Typography>
				<Typography component="p">After you apply, we&apos;ll email you to talk it through.</Typography>
				{user ? (
					<HostApplicationForm email={user.email} />
				) : (
					// A plain Link, not <Button component={Link}>: a server component can't
					// pass a component into MUI's client Button.
					<Link href={`/sign-in?next=${encodeURIComponent("/list-your-space")}`} className={styles.action}>
						Sign in to apply
					</Link>
				)}
			</div>
		</Container>
	);
}
```

- [ ] **Step 4: The header link**

In `app/_components/SiteHeader.tsx`, make the new link the first child of `<div className={styles.account}>`, before the `{user ? (...) : (...)}` block:

```tsx
				<Link href="/list-your-space" className={styles.link}>
					List your space
				</Link>
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm exec jest "list-your-space|SiteHeader|HostApplicationForm"`. Expected: PASS. Existing SiteHeader tests that count links or buttons must still pass. If one fails because it asserts "no other link", stop and report it. Don't edit that assertion.

Then run `pnpm test`, `pnpm typecheck` and `pnpm lint`, and `pnpm build` with the throwaway env. Expected: all clean. The build lists `/list-your-space` as a route.

- [ ] **Step 6: Commit**

```bash
git add app/list-your-space app/_components/SiteHeader.tsx app/_components/SiteHeader.test.tsx
git commit -m "feat(list-your-space): the page, and a header link to it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
