# Slice 7a-1 — Host Applications API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user can `POST /api/host-applications` to apply to list a space. A `PENDING` row is saved with a private address, and ops is emailed ids, city, type and area only.

**Architecture:**
- **Schema:** `HostApplication` gains `userId` and a private `address` column. Descriptive fields go into the existing `payload` JSON, and no app code parses it back.
- **Validation:** a pure validator, shared later with the 7a-2 form.
- **Server code:** a server write, plus a notifier that takes its fields from the route rather than the database.
- **Ops email address:** one helper, `opsAddress(env)`, serves both this notifier and 6-2's report notifier. It reads `OPS_EMAIL_TO` and falls back to `REPORTS_EMAIL_TO`.

**Tech Stack:** Prisma 7 with `@prisma/adapter-pg` (client in `generated/prisma`), Next.js 16.4 route handlers and `after()`, Jest 30 in the node environment with a mocked `prisma`.

**Spec:** `docs/superpowers/specs/2026-10-20-slice-7a-host-applications-design.md`.

## Global Constraints

- **Branch and commits.** Work on branch `feat/slice-7a-host-applications`. Commit locally at each commit step, ending the message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push or rebase.
- **Ownership.**
  - Every task goes to `backend-dev`.
  - The `types.ts` additions are approved exactly as written in Task 1.
  - A new constants file is allowed.
  - Exporting `looksOfficial` from `app/_lib/inquiryValidation.ts` is allowed. Its behaviour must not change.
- **Off limits:** new dependencies, lockfiles, `.env*`, the README, hand-edits under `prisma/migrations/**`, and anything in `generated/**`. The main session edits `.env.example` and the README.
- **Privacy.**
  - `address`, `applicantEmail`, `applicantName` and the description never appear in any response, log line or email.
  - The response body is exactly `{ received: true }`.
  - Log lines carry `{ applicationId }` only.
  - No query outside `hostApplications.ts` touches `HostApplication`.
- **Never create a `Host` or `Space`** from this code.
- **Copy and values, verbatim.**
  - Limits: `HOST_APPLICATIONS_PER_USER_PER_DAY = 5`, `APPLICATION_AREA_MAX = 100`, `APPLICATION_ADDRESS_MAX = 300`, `APPLICATION_DESCRIPTION_MIN = 20`, `APPLICATION_DESCRIPTION_MAX = 2000`, `APPLICATION_RATE_MAX = 1_000_000`. The name uses `INQUIRY_NAME_MAX` (100).
  - Field errors:
    - `Enter your name.`
    - `Use your own name or your business's name.`
    - `Choose a space type.`
    - `Choose a city.`
    - `Enter the area, like Poblacion or Kapitolyo.`
    - `Enter the address.`
    - `Describe the space.`
    - `Tell us a little more about the space (at least 20 characters).`
    - `Enter a whole number of pesos.`
    - `Confirm that this space is yours to list.`
    - `Keep it under {N} characters.`
    - `Remove unsupported characters.`
  - Email subject: `New host application: {CITY} {SPACE_TYPE}`.
  - Log lines: `[host-application] no OPS_EMAIL_TO`, `[host-application] notify failed`, and, renamed, `[report] no OPS_EMAIL_TO`.
- **TypeScript strict.** No `any`, no `@ts-ignore`, no non-null `!`.
- **Tests first.** Watch each new test fail before implementing.
- **Commands.**
  - One file: `pnpm exec jest "<path regex>"`. Then `pnpm typecheck` and `pnpm lint`.
  - The migration needs Docker. If `docker info` fails, run `open -a Docker`, wait until it succeeds, then `docker compose up -d`.
  - At the end, run `pnpm build` with `BETTER_AUTH_SECRET=throwaway-dev-secret-0123456789abcdef BETTER_AUTH_URL=http://localhost:3000`.
- **Size.** About 17 files, half of them tests. One PR; the human has accepted PRs of this size before.

## Review Focus

1. **A city outside Metro Manila, or a made-up type.** "CEBU" or "CASTLE" each give a field error and nothing is saved. Test: Task 2.
2. **Someone posing as Iskawt in the name.** "Iskawt Support" or "Team Iskawt" as `applicantName` is rejected with the host wording. Test: Task 2.
3. **The address leaking anywhere.** It must not appear in the response, the ops email (subject, text or HTML), or any log line, including on failure paths. Test: Tasks 3 and 4.
4. **The spam trap.** A non-empty `website` returns the same 201 `{ received: true }`, but nothing is written and no email is sent. Test: Task 4.
5. **Malformed or hostile input.** Non-JSON, `null`, an array, `hourlyRate: "12.5"`, `confirmsRightToList: "true"` (a string), or a NUL character in any text field each give 400 `VALIDATION` with field errors, never a 500. Test: Tasks 2 and 4.

---

### Task 1: Schema, migration, contract and limits

**Files:**
- Modify: `prisma/schema.prisma` (`HostApplication`, and `User.hostApplications`)
- Create: `prisma/migrations/<timestamp>_host_application_user_and_address/migration.sql`, generated by the CLI
- Modify: `app/_lib/types.ts` (append)
- Create: `app/_lib/constants/hostApplications.ts`

**Interfaces:**
- Produces:
  - `prisma.hostApplication` with `userId`, `address` and the `user` relation;
  - the types `NewHostApplicationInput`, `HostApplicationFieldErrors`, `CreateHostApplicationResponse` and `HostApplicationApiError`;
  - the limit constants listed in Global Constraints.

- [ ] **Step 1: Schema**

Replace the `HostApplication` model in `prisma/schema.prisma` with:

```prisma
// Hosts apply to list; a human reviews and creates the Host and Space rows.
// Kept separate so nothing unreviewed ever appears as a listing.
model HostApplication {
  id      String            @id @default(cuid())
  status  ApplicationStatus @default(PENDING)
  payload Json // the form as submitted, minus applicantName and address. Never parsed back.
  notes   String?           @db.Text

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  applicantName  String
  applicantEmail String // PRIVATE. From the session, never typed.
  address        String @db.Text // PRIVATE. Ops only, in Studio. Clear it when setting REJECTED.

  createdAt  DateTime  @default(now())
  reviewedAt DateTime?

  @@index([status, createdAt])
  @@index([userId, createdAt])
}
```

In `model User`, after the `reports` line, add `hostApplications HostApplication[]`.

- [ ] **Step 2: Migration**

Run `pnpm exec prisma migrate dev --name host_application_user_and_address`, starting Docker first if needed. Then run `pnpm exec prisma generate`.
Expected: a new migration that adds the `userId` and `address` columns, the foreign key and the index. Don't edit the SQL.

If the CLI warns that required columns can't be added because the local table has rows, stop and report it. The table is meant to be empty everywhere.

- [ ] **Step 3: Contract**

Append to `app/_lib/types.ts`:

```ts
// ---- Host applications (POST /api/host-applications)

export type NewHostApplicationInput = {
	applicantName: string; // 1–100, trimmed, name filter
	spaceType: SpaceType;
	city: City;
	areaName: string; // 1–100, trimmed
	address: string; // 1–300, trimmed. PRIVATE: never echoed back
	description: string; // 20–2000, trimmed
	hourlyRate: number | null; // whole pesos, 1–1,000,000
	confirmsRightToList: true;
	website: string; // spam trap: hidden field, must be empty
};
export type HostApplicationFieldErrors = Partial<Record<keyof NewHostApplicationInput, string>>;
export type CreateHostApplicationResponse = { received: true }; // 201; no id
export type HostApplicationApiError = {
	error: "UNAUTHENTICATED" | "VALIDATION" | "RATE_LIMITED";
	fields?: HostApplicationFieldErrors;
};
```

`SpaceType` and `City` are already imported in `types.ts`. If they're only re-exported, add them to the file's local `import type` from `@/generated/prisma/enums`.

- [ ] **Step 4: Limits**

Create `app/_lib/constants/hostApplications.ts`:

```ts
// Limits for host applications. Shared by the validator, the server and the form.
// The applicant's name reuses INQUIRY_NAME_MAX from inquiries.ts.

export const HOST_APPLICATIONS_PER_USER_PER_DAY = 5;
export const APPLICATION_AREA_MAX = 100;
export const APPLICATION_ADDRESS_MAX = 300;
export const APPLICATION_DESCRIPTION_MIN = 20;
export const APPLICATION_DESCRIPTION_MAX = 2000;
export const APPLICATION_RATE_MAX = 1_000_000;
```

- [ ] **Step 5: Check**

Run `pnpm typecheck` and `pnpm test`. Expected: both clean. Nothing uses the new code yet.

Also run `grep -rn "hostApplication" app --include=*.ts`. Expected: no hits yet. If you see any, report them.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations app/_lib/types.ts app/_lib/constants/hostApplications.ts
git commit -m "feat(host-applications): applications belong to a user and keep a private address

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The validator

**Files:**
- Create: `app/_lib/hostApplicationValidation.ts`, `app/_lib/hostApplicationValidation.test.ts`
- Modify: `app/_lib/inquiryValidation.ts`. Change `function looksOfficial` to `export function looksOfficial`, with no other change.

**Interfaces:**
- Consumes: the limits and types from Task 1, and `looksOfficial(name: string): boolean`.
- Produces: `validateNewHostApplication(input: unknown): { ok: true; value: NewHostApplicationInput } | { ok: false; errors: HostApplicationFieldErrors }`.

- [ ] **Step 1: Write the failing tests**

Create `app/_lib/hostApplicationValidation.test.ts`:

```ts
import { validateNewHostApplication } from "@/app/_lib/hostApplicationValidation";
import { City } from "@/generated/prisma/enums";

const valid = {
	applicantName: "  Demo Host  ",
	spaceType: "STUDIO",
	city: "MAKATI",
	areaName: " Poblacion ",
	address: "  [UNIT NO.] [BUILDING NAME], Demo Street, Poblacion, Makati  ",
	description: "  A daylight studio with a white cyc and blackout curtains.  ",
	hourlyRate: "1500",
	confirmsRightToList: true,
	website: "",
};

it("accepts a valid application and normalises it", () => {
	expect(validateNewHostApplication(valid)).toEqual({
		ok: true,
		value: {
			applicantName: "Demo Host",
			spaceType: "STUDIO",
			city: "MAKATI",
			areaName: "Poblacion",
			address: "[UNIT NO.] [BUILDING NAME], Demo Street, Poblacion, Makati",
			description: "A daylight studio with a white cyc and blackout curtains.",
			hourlyRate: 1500,
			confirmsRightToList: true,
			website: "",
		},
	});
});

it("accepts every Metro Manila city", () => {
	for (const city of Object.values(City)) {
		expect(validateNewHostApplication({ ...valid, city }).ok).toBe(true);
	}
});

it.each([null, undefined, ""])("treats a missing rate (%p) as null", (hourlyRate) => {
	expect(validateNewHostApplication({ ...valid, hourlyRate })).toMatchObject({ ok: true, value: { hourlyRate: null } });
});

it("accepts exactly 20 and 2000 description characters, counting code points", () => {
	expect(validateNewHostApplication({ ...valid, description: "x".repeat(20) }).ok).toBe(true);
	expect(validateNewHostApplication({ ...valid, description: "🎬".repeat(2000) }).ok).toBe(true);
});

it.each([
	["applicantName", { applicantName: "  " }, "Enter your name."],
	["applicantName", { applicantName: "x".repeat(101) }, "Keep it under 100 characters."],
	["applicantName", { applicantName: "Iskawt Support" }, "Use your own name or your business's name."],
	["applicantName", { applicantName: "Team Iskawt" }, "Use your own name or your business's name."],
	["spaceType", { spaceType: "CASTLE" }, "Choose a space type."],
	["spaceType", { spaceType: undefined }, "Choose a space type."],
	["city", { city: "CEBU" }, "Choose a city."],
	["city", { city: "makati" }, "Choose a city."],
	["areaName", { areaName: "" }, "Enter the area, like Poblacion or Kapitolyo."],
	["areaName", { areaName: "x".repeat(101) }, "Keep it under 100 characters."],
	["address", { address: " " }, "Enter the address."],
	["address", { address: "x".repeat(301) }, "Keep it under 300 characters."],
	["description", { description: "" }, "Describe the space."],
	["description", { description: "Too short" }, "Tell us a little more about the space (at least 20 characters)."],
	["description", { description: "x".repeat(2001) }, "Keep it under 2000 characters."],
	["hourlyRate", { hourlyRate: "12.5" }, "Enter a whole number of pesos."],
	["hourlyRate", { hourlyRate: 0 }, "Enter a whole number of pesos."],
	["hourlyRate", { hourlyRate: 1_000_001 }, "Enter a whole number of pesos."],
	["hourlyRate", { hourlyRate: "abc" }, "Enter a whole number of pesos."],
	["confirmsRightToList", { confirmsRightToList: false }, "Confirm that this space is yours to list."],
	["confirmsRightToList", { confirmsRightToList: "true" }, "Confirm that this space is yours to list."],
	["confirmsRightToList", { confirmsRightToList: undefined }, "Confirm that this space is yours to list."],
	["applicantName", { applicantName: "Demo\u0000Host" }, "Remove unsupported characters."],
	["areaName", { areaName: "Pob\u0000lacion" }, "Remove unsupported characters."],
	["address", { address: "Demo\u0000Street" }, "Remove unsupported characters."],
	["description", { description: "A daylight studio\u0000 with a white cyc." }, "Remove unsupported characters."],
	["applicantName", { applicantName: 42 }, "Enter your name."],
	["address", { address: ["x"] }, "Enter the address."],
])("rejects a bad %s (%o)", (field, patch, error) => {
	expect(validateNewHostApplication({ ...valid, ...patch })).toEqual({ ok: false, errors: { [field]: error } });
});

it.each([null, "text", 42, ["a"]])("rejects a non-object (%p) without throwing", (input) => {
	expect(validateNewHostApplication(input)).toMatchObject({ ok: false });
});

it("keeps the spam-trap value as given, trimmed", () => {
	expect(validateNewHostApplication({ ...valid, website: " http://x " })).toMatchObject({ ok: true, value: { website: "http://x" } });
});
```

Run: `pnpm exec jest "hostApplicationValidation"`. Expected: FAIL, because the module doesn't exist yet.

- [ ] **Step 2: Export the name filter**

In `app/_lib/inquiryValidation.ts`, change `function looksOfficial(name: string): boolean {` to `export function looksOfficial(name: string): boolean {`. Add one comment line above it: `// Shared with hostApplicationValidation.ts.`

- [ ] **Step 3: Implement**

Create `app/_lib/hostApplicationValidation.ts`:

```ts
// Validation for host applications. Pure, with no server imports, so the route
// and the "List your space" form share exactly the same rules.

import {
	APPLICATION_ADDRESS_MAX,
	APPLICATION_AREA_MAX,
	APPLICATION_DESCRIPTION_MAX,
	APPLICATION_DESCRIPTION_MIN,
	APPLICATION_RATE_MAX,
} from "@/app/_lib/constants/hostApplications";
import { INQUIRY_NAME_MAX } from "@/app/_lib/constants/inquiries";
import { looksOfficial } from "@/app/_lib/inquiryValidation";
import { City, SpaceType } from "@/generated/prisma/enums";
import type { HostApplicationFieldErrors, NewHostApplicationInput } from "@/app/_lib/types";

const CITIES: readonly string[] = Object.values(City);
const SPACE_TYPES: readonly string[] = Object.values(SpaceType);
const isCity = (value: unknown): value is City => typeof value === "string" && CITIES.includes(value);
const isSpaceType = (value: unknown): value is SpaceType => typeof value === "string" && SPACE_TYPES.includes(value);

const chars = (value: string) => [...value].length; // code points, not UTF-16 units
const tooLong = (max: number) => `Keep it under ${max} characters.`;
const UNSUPPORTED = "Remove unsupported characters.";

// A required text field: trimmed; empty, a non-string, NUL or too long is an error.
function requiredText(value: unknown, empty: string, max: number): { value: string; error: string | null } {
	if (typeof value !== "string") return { value: "", error: empty };
	if (value.includes("\u0000")) return { value: "", error: UNSUPPORTED };
	const trimmed = value.trim();
	if (!trimmed) return { value: "", error: empty };
	if (chars(trimmed) > max) return { value: trimmed, error: tooLong(max) };
	return { value: trimmed, error: null };
}

function rate(value: unknown): number | null | "invalid" {
	if (value === null || value === undefined || value === "") return null;
	const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
	return Number.isInteger(n) && n >= 1 && n <= APPLICATION_RATE_MAX ? n : "invalid";
}

export function validateNewHostApplication(
	input: unknown,
): { ok: true; value: NewHostApplicationInput } | { ok: false; errors: HostApplicationFieldErrors } {
	const raw: Record<string, unknown> =
		typeof input === "object" && input !== null && !Array.isArray(input) ? { ...input } : {};
	const errors: HostApplicationFieldErrors = {};

	const name = requiredText(raw.applicantName, "Enter your name.", INQUIRY_NAME_MAX);
	if (name.error) errors.applicantName = name.error;
	else if (looksOfficial(name.value)) errors.applicantName = "Use your own name or your business's name.";

	if (!isSpaceType(raw.spaceType)) errors.spaceType = "Choose a space type.";
	if (!isCity(raw.city)) errors.city = "Choose a city.";

	const area = requiredText(raw.areaName, "Enter the area, like Poblacion or Kapitolyo.", APPLICATION_AREA_MAX);
	if (area.error) errors.areaName = area.error;

	const address = requiredText(raw.address, "Enter the address.", APPLICATION_ADDRESS_MAX);
	if (address.error) errors.address = address.error;

	const description = requiredText(raw.description, "Describe the space.", APPLICATION_DESCRIPTION_MAX);
	if (description.error) errors.description = description.error;
	else if (chars(description.value) < APPLICATION_DESCRIPTION_MIN) {
		errors.description = `Tell us a little more about the space (at least ${APPLICATION_DESCRIPTION_MIN} characters).`;
	}

	const hourlyRate = rate(raw.hourlyRate);
	if (hourlyRate === "invalid") errors.hourlyRate = "Enter a whole number of pesos.";

	if (raw.confirmsRightToList !== true) errors.confirmsRightToList = "Confirm that this space is yours to list.";

	const website = typeof raw.website === "string" ? raw.website.trim() : "";

	if (
		Object.keys(errors).length > 0 ||
		!isSpaceType(raw.spaceType) ||
		!isCity(raw.city) ||
		hourlyRate === "invalid" ||
		raw.confirmsRightToList !== true
	) {
		return { ok: false, errors };
	}
	return {
		ok: true,
		value: {
			applicantName: name.value,
			spaceType: raw.spaceType,
			city: raw.city,
			areaName: area.value,
			address: address.value,
			description: description.value,
			hourlyRate,
			confirmsRightToList: true,
			website,
		},
	};
}
```

A non-object input gives an `errors` object with every field set, which is what the `toMatchObject({ ok: false })` test expects.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm exec jest "hostApplicationValidation|inquiryValidation"`. Expected: PASS. The `inquiryValidation` tests are unchanged and still pass. Then run `pnpm typecheck` and `pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/hostApplicationValidation.ts app/_lib/hostApplicationValidation.test.ts app/_lib/inquiryValidation.ts
git commit -m "feat(host-applications): shared validator for the List your space form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ops address helper, report rename, and the application notifier

**Files:**
- Create: `app/_lib/server/opsEmail.ts`, `app/_lib/server/opsEmail.test.ts`
- Modify: `app/_lib/server/reportNotify.ts`, `app/_lib/server/reportNotify.test.ts`
- Create: `app/_lib/server/hostApplicationNotify.ts`, `app/_lib/server/hostApplicationNotify.test.ts`

**Interfaces:**
- Consumes: `getMailer` and `MailMessage` from `@/app/_lib/server/mailer`, `escapeHtml`, and the `City` and `SpaceType` types.
- Produces:

```ts
// opsEmail.ts
export function opsAddress(env: NodeJS.ProcessEnv): string | null;
// hostApplicationNotify.ts
export type HostApplicationNotice = { applicationId: string; spaceType: SpaceType; city: City; areaName: string; existingHost: boolean };
export function hostApplicationEmail(args: HostApplicationNotice & { to: string }): MailMessage;
export async function notifyHostApplication(notice: HostApplicationNotice, env?: NodeJS.ProcessEnv): Promise<void>;
```

- [ ] **Step 1: Write the failing tests**

`app/_lib/server/opsEmail.test.ts`:

```ts
/** @jest-environment node */
import { opsAddress } from "@/app/_lib/server/opsEmail";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

it("prefers OPS_EMAIL_TO, falls back to REPORTS_EMAIL_TO, else null", () => {
	expect(opsAddress(env({ OPS_EMAIL_TO: "ops@example.invalid", REPORTS_EMAIL_TO: "old@example.invalid" }))).toBe("ops@example.invalid");
	expect(opsAddress(env({ REPORTS_EMAIL_TO: "old@example.invalid" }))).toBe("old@example.invalid");
	expect(opsAddress(env({}))).toBeNull();
	expect(opsAddress(env({ OPS_EMAIL_TO: "  " }))).toBeNull();
});
```

In `app/_lib/server/reportNotify.test.ts`:
- change the `env` fixture to `{ OPS_EMAIL_TO: "ops@example.invalid" }`;
- rename the two test titles that mention `REPORTS_EMAIL_TO` so they say `OPS_EMAIL_TO`;
- change the expected unset log line to `"[report] no OPS_EMAIL_TO"`;
- add:

```ts
it("still sends to REPORTS_EMAIL_TO when only the old name is set", async () => {
	await notifyReport("rep_1", { REPORTS_EMAIL_TO: "old@example.invalid" } as unknown as NodeJS.ProcessEnv);
	expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: "old@example.invalid" }));
});
```

`app/_lib/server/hostApplicationNotify.test.ts`:

```ts
/** @jest-environment node */
const mockSend = jest.fn();
jest.mock("@/app/_lib/server/mailer", () => ({ getMailer: () => ({ send: (...a: unknown[]) => mockSend(...a) }) }));

import { hostApplicationEmail, notifyHostApplication } from "@/app/_lib/server/hostApplicationNotify";

const notice = { applicationId: "app_1", spaceType: "STUDIO" as const, city: "MAKATI" as const, areaName: "Poblacion", existingHost: false };
const env = { OPS_EMAIL_TO: "ops@example.invalid" } as unknown as NodeJS.ProcessEnv;

let errorSpy: jest.SpyInstance;
beforeEach(() => {
	jest.resetAllMocks();
	mockSend.mockResolvedValue(undefined);
	errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

it("builds an email with the id, type, area and city only", () => {
	expect(hostApplicationEmail({ ...notice, to: "ops@example.invalid" })).toEqual({
		to: "ops@example.invalid",
		subject: "New host application: MAKATI STUDIO",
		text: "Application app_1: STUDIO in Poblacion, MAKATI.\n\nReview in Prisma Studio.",
		html: "<p>Application app_1: STUDIO in Poblacion, MAKATI.</p><p>Review in Prisma Studio.</p>",
	});
});

it("flags an existing host", () => {
	const msg = hostApplicationEmail({ ...notice, existingHost: true, to: "ops@example.invalid" });
	expect(msg.text).toBe("Application app_1: STUDIO in Poblacion, MAKATI.\nExisting host.\n\nReview in Prisma Studio.");
	expect(msg.html).toContain("<p>Existing host.</p>");
});

it("escapes the area in HTML and keeps it on one line in the text", () => {
	const msg = hostApplicationEmail({ ...notice, areaName: "<b>Pob</b>\r\nBcc: x", to: "ops@example.invalid" });
	expect(msg.html).not.toContain("<b>");
	expect(msg.text.split("\n")[0]).toBe("Application app_1: STUDIO in <b>Pob</b> Bcc: x, MAKATI.");
});

it("sends to the ops address", async () => {
	await notifyHostApplication(notice, env);
	expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: "ops@example.invalid", subject: "New host application: MAKATI STUDIO" }));
});

it("logs the fixed line and sends nothing when no ops address is set", async () => {
	await notifyHostApplication(notice, {} as NodeJS.ProcessEnv);
	expect(errorSpy).toHaveBeenCalledWith("[host-application] no OPS_EMAIL_TO");
	expect(mockSend).not.toHaveBeenCalled();
});

it("never throws; a send failure logs the application id only", async () => {
	mockSend.mockRejectedValue(new Error("Resend responded 503 for ops@example.invalid"));
	await expect(notifyHostApplication(notice, env)).resolves.toBeUndefined();
	expect(errorSpy).toHaveBeenCalledWith("[host-application] notify failed", { applicationId: "app_1" });
	expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(/example\.invalid|Poblacion/);
});
```

Run: `pnpm exec jest "opsEmail|reportNotify|hostApplicationNotify"`. Expected: FAIL. The new modules don't exist yet, and `reportNotify` still reads `REPORTS_EMAIL_TO` only.

- [ ] **Step 2: Implement `opsEmail.ts`**

```ts
// Where ops notices go: new reports and new host applications. OPS_EMAIL_TO is
// the name; REPORTS_EMAIL_TO is its 6-2 predecessor, still read so nothing
// already configured stops working.

export function opsAddress(env: NodeJS.ProcessEnv): string | null {
	const address = (env.OPS_EMAIL_TO ?? env.REPORTS_EMAIL_TO ?? "").trim();
	return address || null;
}
```

Note: with `OPS_EMAIL_TO: "  "`, the expected result is null. `??` doesn't fall through on a blank string, so a whitespace-only `OPS_EMAIL_TO` gives null instead of trying `REPORTS_EMAIL_TO`. That's accepted: a blank value is a misconfiguration that should be visible.

- [ ] **Step 3: Rename in `reportNotify.ts`**

- Import `opsAddress` from `@/app/_lib/server/opsEmail`.
- Replace `const to = env.REPORTS_EMAIL_TO;` with `const to = opsAddress(env);`.
- Replace the log line with `console.error("[report] no OPS_EMAIL_TO");`.

- [ ] **Step 4: Implement `hostApplicationNotify.ts`**

```ts
// Tells ops a host application arrived. Runs from after(), so it never delays
// or fails the request. Ids, city, type and area only: the address, the
// applicant's name and email and the description are read in Prisma Studio.
// The route passes these fields from the validated input; nothing here reads
// the database, so the stored payload is never parsed back.

import { escapeHtml } from "@/app/_lib/server/escapeHtml";
import { getMailer, type MailMessage } from "@/app/_lib/server/mailer";
import { opsAddress } from "@/app/_lib/server/opsEmail";
import type { City, SpaceType } from "@/app/_lib/types";

export type HostApplicationNotice = {
	applicationId: string;
	spaceType: SpaceType;
	city: City;
	areaName: string;
	existingHost: boolean;
};

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ");

export function hostApplicationEmail({ to, applicationId, spaceType, city, areaName, existingHost }: HostApplicationNotice & { to: string }): MailMessage {
	const summary = `Application ${applicationId}: ${spaceType} in ${oneLine(areaName)}, ${city}.`;
	const lines = existingHost ? [summary, "Existing host."] : [summary];
	const footer = "Review in Prisma Studio.";
	return {
		to,
		subject: `New host application: ${city} ${spaceType}`,
		text: `${lines.join("\n")}\n\n${footer}`,
		html: [...lines, footer].map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
	};
}

export async function notifyHostApplication(notice: HostApplicationNotice, env: NodeJS.ProcessEnv = process.env): Promise<void> {
	try {
		const to = opsAddress(env);
		if (!to) {
			console.error("[host-application] no OPS_EMAIL_TO");
			return;
		}
		await getMailer().send(hostApplicationEmail({ ...notice, to }));
	} catch {
		console.error("[host-application] notify failed", { applicationId: notice.applicationId });
	}
}
```

`City` and `SpaceType` must be importable as types from `@/app/_lib/types` (they're re-exported). If the import fails, import them from `@/generated/prisma/enums` instead.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm exec jest "opsEmail|reportNotify|hostApplicationNotify|safetyRoutes"`. Expected: PASS. Then run `pnpm typecheck` and `pnpm lint`.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/server/opsEmail.ts app/_lib/server/opsEmail.test.ts app/_lib/server/reportNotify.ts app/_lib/server/reportNotify.test.ts app/_lib/server/hostApplicationNotify.ts app/_lib/server/hostApplicationNotify.test.ts
git commit -m "feat(host-applications): ops is emailed ids, city, type and area; OPS_EMAIL_TO replaces REPORTS_EMAIL_TO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The write and the route

**Files:**
- Create: `app/_lib/server/hostApplications.ts`, `app/_lib/server/hostApplications.test.ts`
- Create: `app/api/host-applications/route.ts`, `app/api/host-applications/route.test.ts`

**Interfaces:**
- Consumes: `validateNewHostApplication` (Task 2), `notifyHostApplication` (Task 3), `getCurrentUser()`, which returns `CurrentUser | null` with `{ id, email, name, host }`, and the types from Task 1.
- Produces:

```ts
export type HostApplicationResult = { kind: "created"; id: string } | { kind: "rate-limited" };
export async function createHostApplication(
	user: { id: string; email: string },
	input: NewHostApplicationInput,
	now?: Date,
): Promise<HostApplicationResult>;
```

- [ ] **Step 1: Write the failing server tests**

`app/_lib/server/hostApplications.test.ts`:

```ts
/** @jest-environment node */
const mockCount = jest.fn();
const mockCreate = jest.fn();
jest.mock("@/app/_lib/db", () => ({
	prisma: { hostApplication: { count: (...a: unknown[]) => mockCount(...a), create: (...a: unknown[]) => mockCreate(...a) } },
}));

import { createHostApplication } from "@/app/_lib/server/hostApplications";

const now = new Date("2026-10-20T10:00:00Z");
const dayAgo = new Date("2026-10-19T10:00:00Z");
const user = { id: "user_1", email: "demo-host@example.invalid" };
const input = {
	applicantName: "Demo Host",
	spaceType: "STUDIO" as const,
	city: "MAKATI" as const,
	areaName: "Poblacion",
	address: "[UNIT NO.] [BUILDING NAME], Demo Street, Poblacion, Makati",
	description: "A daylight studio with a white cyc.",
	hourlyRate: 1500,
	confirmsRightToList: true as const,
	website: "",
};

beforeEach(() => {
	jest.resetAllMocks();
	mockCount.mockResolvedValue(0);
	mockCreate.mockResolvedValue({ id: "app_1" });
});

it("saves a PENDING application with the session's id and email, and the address in its own column", async () => {
	await expect(createHostApplication(user, input, now)).resolves.toEqual({ kind: "created", id: "app_1" });
	expect(mockCreate).toHaveBeenCalledWith({
		data: {
			userId: "user_1",
			applicantEmail: "demo-host@example.invalid",
			applicantName: "Demo Host",
			address: "[UNIT NO.] [BUILDING NAME], Demo Street, Poblacion, Makati",
			payload: { spaceType: "STUDIO", city: "MAKATI", areaName: "Poblacion", description: "A daylight studio with a white cyc.", hourlyRate: 1500 },
		},
		select: { id: true },
	});
});

it("is rate-limited at 5 in the last 24 hours, and writes nothing", async () => {
	mockCount.mockResolvedValue(5);
	await expect(createHostApplication(user, input, now)).resolves.toEqual({ kind: "rate-limited" });
	expect(mockCount).toHaveBeenCalledWith({ where: { userId: "user_1", createdAt: { gt: dayAgo } } });
	expect(mockCreate).not.toHaveBeenCalled();
});

it("allows the 5th (4 before it)", async () => {
	mockCount.mockResolvedValue(4);
	await expect(createHostApplication(user, input, now)).resolves.toMatchObject({ kind: "created" });
});
```

Run: `pnpm exec jest "server/hostApplications"`. Expected: FAIL.

- [ ] **Step 2: Implement `hostApplications.ts`**

```ts
// Host applications. A human reviews each one in Prisma Studio and creates the
// Host and Space rows by hand: nothing here ever creates either. The address
// and the applicant's email are private to ops, never returned or logged.

import { HOST_APPLICATIONS_PER_USER_PER_DAY } from "@/app/_lib/constants/hostApplications";
import { prisma } from "@/app/_lib/db";
import type { NewHostApplicationInput } from "@/app/_lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type HostApplicationResult = { kind: "created"; id: string } | { kind: "rate-limited" };

export async function createHostApplication(
	user: { id: string; email: string },
	input: NewHostApplicationInput,
	now: Date = new Date(),
): Promise<HostApplicationResult> {
	const recent = await prisma.hostApplication.count({
		where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
	});
	if (recent >= HOST_APPLICATIONS_PER_USER_PER_DAY) return { kind: "rate-limited" };
	const created = await prisma.hostApplication.create({
		data: {
			userId: user.id,
			applicantEmail: user.email,
			applicantName: input.applicantName,
			address: input.address,
			payload: {
				spaceType: input.spaceType,
				city: input.city,
				areaName: input.areaName,
				description: input.description,
				hourlyRate: input.hourlyRate,
			},
		},
		select: { id: true },
	});
	return { kind: "created", id: created.id };
}
```

Run: `pnpm exec jest "server/hostApplications"`. Expected: PASS.

- [ ] **Step 3: Write the failing route tests**

`app/api/host-applications/route.test.ts`:

```ts
/** @jest-environment node */
const mockGetCurrentUser = jest.fn();
const mockCreate = jest.fn();
const mockNotify = jest.fn();
const afterCallbacks: Array<() => unknown> = [];
jest.mock("@/app/_lib/server/currentUser", () => ({ getCurrentUser: () => mockGetCurrentUser() }));
jest.mock("@/app/_lib/server/hostApplications", () => ({ createHostApplication: (...a: unknown[]) => mockCreate(...a) }));
jest.mock("@/app/_lib/server/hostApplicationNotify", () => ({ notifyHostApplication: (...a: unknown[]) => mockNotify(...a) }));
jest.mock("next/server", () => ({ after: (cb: () => unknown) => afterCallbacks.push(cb) }));

import { POST } from "@/app/api/host-applications/route";

const user = { id: "user_1", email: "demo-host@example.invalid", name: null, host: null };
const body = {
	applicantName: "Demo Host",
	spaceType: "STUDIO",
	city: "MAKATI",
	areaName: "Poblacion",
	address: "[UNIT NO.] [BUILDING NAME], Demo Street, Poblacion, Makati",
	description: "A daylight studio with a white cyc.",
	hourlyRate: 1500,
	confirmsRightToList: true,
	website: "",
};
const req = (payload: unknown) =>
	new Request("http://localhost/api/host-applications", {
		method: "POST",
		body: typeof payload === "string" ? payload : JSON.stringify(payload),
		headers: { "content-type": "application/json" },
	});

let logSpies: jest.SpyInstance[];
beforeEach(() => {
	jest.resetAllMocks();
	afterCallbacks.length = 0;
	mockGetCurrentUser.mockResolvedValue(user);
	mockCreate.mockResolvedValue({ kind: "created", id: "app_1" });
	logSpies = [jest.spyOn(console, "log"), jest.spyOn(console, "info"), jest.spyOn(console, "error")];
});
afterEach(() => logSpies.forEach((s) => s.mockRestore()));

it("401 when signed out, and writes nothing", async () => {
	mockGetCurrentUser.mockResolvedValue(null);
	const res = await POST(req(body));
	expect(res.status).toBe(401);
	expect(await res.json()).toEqual({ error: "UNAUTHENTICATED" });
	expect(mockCreate).not.toHaveBeenCalled();
});

it("201 { received: true } only, then notifies ops with city, type, area and the host flag", async () => {
	const res = await POST(req(body));
	expect(res.status).toBe(201);
	const text = await res.text();
	expect(JSON.parse(text)).toEqual({ received: true });
	expect(text).not.toMatch(/Demo Street|demo-host|app_1/);
	expect(mockCreate).toHaveBeenCalledWith({ id: "user_1", email: "demo-host@example.invalid" }, expect.objectContaining({ city: "MAKATI", address: body.address }));
	expect(afterCallbacks).toHaveLength(1);
	await afterCallbacks[0]();
	expect(mockNotify).toHaveBeenCalledWith({ applicationId: "app_1", spaceType: "STUDIO", city: "MAKATI", areaName: "Poblacion", existingHost: false });
});

it("flags an existing linked host", async () => {
	mockGetCurrentUser.mockResolvedValue({ ...user, host: { displayName: "Demo Host A" } });
	await POST(req(body));
	await afterCallbacks[0]();
	expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ existingHost: true }));
});

it.each([
	[{ ...body, city: "CEBU" }, { city: "Choose a city." }],
	[{ ...body, confirmsRightToList: "true" }, { confirmsRightToList: "Confirm that this space is yours to list." }],
	[{ ...body, hourlyRate: "12.5" }, { hourlyRate: "Enter a whole number of pesos." }],
	[{ ...body, address: "Demo\u0000Street" }, { address: "Remove unsupported characters." }],
])("400 VALIDATION with field errors (%#)", async (payload, fields) => {
	const res = await POST(req(payload));
	expect(res.status).toBe(400);
	expect(await res.json()).toEqual({ error: "VALIDATION", fields });
	expect(mockCreate).not.toHaveBeenCalled();
});

it.each(["{not json", "null", "[1,2]"])("400 VALIDATION for a malformed body (%s)", async (raw) => {
	const res = await POST(req(raw));
	expect(res.status).toBe(400);
	expect(await res.json()).toMatchObject({ error: "VALIDATION" });
});

it("429 RATE_LIMITED, no notification", async () => {
	mockCreate.mockResolvedValue({ kind: "rate-limited" });
	const res = await POST(req(body));
	expect(res.status).toBe(429);
	expect(await res.json()).toEqual({ error: "RATE_LIMITED" });
	expect(afterCallbacks).toHaveLength(0);
});

it("spam trap: same 201, nothing saved, nothing sent", async () => {
	const res = await POST(req({ ...body, website: "http://spam.example" }));
	expect(res.status).toBe(201);
	expect(await res.json()).toEqual({ received: true });
	expect(mockCreate).not.toHaveBeenCalled();
	expect(afterCallbacks).toHaveLength(0);
});

it("logs nothing about the applicant", async () => {
	await POST(req(body));
	await afterCallbacks[0]();
	for (const spy of logSpies) expect(JSON.stringify(spy.mock.calls)).not.toMatch(/Demo Street|demo-host|Demo Host/);
});
```

Run: `pnpm exec jest "api/host-applications"`. Expected: FAIL.

- [ ] **Step 4: Implement the route**

`app/api/host-applications/route.ts`:

```ts
import { after } from "next/server";
import { validateNewHostApplication } from "@/app/_lib/hostApplicationValidation";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { notifyHostApplication } from "@/app/_lib/server/hostApplicationNotify";
import { createHostApplication } from "@/app/_lib/server/hostApplications";
import type { CreateHostApplicationResponse, HostApplicationApiError } from "@/app/_lib/types";

const error = (body: HostApplicationApiError, status: number) => Response.json(body, { status });
const received = () => Response.json({ received: true } satisfies CreateHostApplicationResponse, { status: 201 });

// Signed-in users apply to list a space. The response never echoes anything
// back: there is nothing for the applicant to look up, and the address is ops-only.
export async function POST(request: Request): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);

	const body: unknown = await request.json().catch(() => null);
	const result = validateNewHostApplication(body);
	if (!result.ok) return error({ error: "VALIDATION", fields: result.errors }, 400);

	// Spam trap: answer as if it worked, keep nothing.
	if (result.value.website) return received();

	const outcome = await createHostApplication({ id: user.id, email: user.email }, result.value);
	if (outcome.kind === "rate-limited") return error({ error: "RATE_LIMITED" }, 429);

	const { spaceType, city, areaName } = result.value;
	const existingHost = user.host !== null;
	after(() => notifyHostApplication({ applicationId: outcome.id, spaceType, city, areaName, existingHost }));
	return received();
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm exec jest "server/hostApplications|api/host-applications"`. Expected: PASS.

- [ ] **Step 6: Full checks**

Run `pnpm test`, `pnpm typecheck` and `pnpm lint`, then `pnpm build` with the throwaway env from Global Constraints. Expected: all clean.

Also run `grep -rn "hostApplication\." app --include=*.ts | grep -v test`. Expected: hits only in `app/_lib/server/hostApplications.ts`.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/server/hostApplications.ts app/_lib/server/hostApplications.test.ts app/api/host-applications/route.ts app/api/host-applications/route.test.ts
git commit -m "feat(host-applications): POST /api/host-applications saves a PENDING application

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**After Task 4, the main session** updates `.env.example` and the README to name `OPS_EMAIL_TO`, and notes that `REPORTS_EMAIL_TO` still works.
