# Slice 7a — Host applications

Status: design approved in the main session, 2026-10-20. Awaiting spec review.
`PLAN.md` calls this "Slice 6 — Host applications and ship". The safety work took
the slice-6 name, so this is slice 7. It is split into **7a**, host applications
(this spec), and **7b**, ship: Vercel, Neon and the README. 7b gets its own spec.

Builds on: slice 5a (accounts, `CurrentUser`, `Host.userId` auto-linking), 6-1 (the
requester-name filter) and 6-2 (the ops-email pattern in `reportNotify.ts`).

## What this slice does

A signed-in user can apply to list a space from `/list-your-space`. The application
is saved as a `HostApplication` in `PENDING` state, and ops is emailed. A human
reviews it in Prisma Studio, talks to the applicant, and creates the `Host` and
`Space` rows by hand. **Nothing is ever created or published automatically.**

## Decisions

| Question | Decision |
| --- | --- |
| Sign in first? | **Yes.** The email is proven, the application is tied to a `User`, and when ops creates the `Host` with that email, 5a's auto-linking connects the account. |
| Fields | Short form: name, space type, city, area, **full address**, description, rough hourly rate (optional), and a confirmation of the right to list. **No phone**: hosts share their number themselves, by replying to ops's email. |
| The address | It is stored, privately. Only ops sees it, in Studio. No page, API response, log line or email ever contains it. On approval, ops copies it into `Space.exactAddress`. |
| Rejected applications | Ops clears `address` when setting `REJECTED` in Studio. This is a manual review step, because no code runs there. |
| Applications per person | Any number, at most `HOST_APPLICATIONS_PER_USER_PER_DAY = 5`. |
| Storage | Descriptive fields go in the existing `payload` JSON. `address` gets its own private column, so it is easy to guard and to clear. |
| Ops email | Ids, city, type and area only. It goes to `OPS_EMAIL_TO`, a rename of 6-2's `REPORTS_EMAIL_TO`. The old name is kept as a fallback. |
| Photos | Not in v1. There is no storage. Photos are arranged by email after the first conversation. |
| Delivery | Two PRs: **7a-1** backend, **7a-2** frontend. |

## Data model (schema change and migration)

```prisma
// Hosts apply to list; a human reviews and creates the Host and Space rows.
// Kept separate so nothing unreviewed ever appears as a listing.
model HostApplication {
  id      String            @id @default(cuid())
  status  ApplicationStatus @default(PENDING)
  payload Json // the form as submitted, minus applicantName and address
  notes   String?           @db.Text

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  applicantName  String
  applicantEmail String // PRIVATE. From the session, never typed.
  address        String @db.Text // PRIVATE. Ops only, in Studio. Cleared on REJECTED.

  createdAt  DateTime  @default(now())
  reviewedAt DateTime?

  @@index([status, createdAt])
  @@index([userId, createdAt])
}
```

`User` gains `hostApplications HostApplication[]`. The table has no rows in any
database (nothing is deployed, and the seed creates none), so the two new required
columns migrate cleanly.

`payload` is `{ spaceType, city, areaName, description, hourlyRate }`, written by the
server from validated input. It is never parsed back by app code.

## Contract — additions to `app/_lib/types.ts`

```ts
// POST /api/host-applications
export type NewHostApplicationInput = {
	applicantName: string; // 1–100, trimmed, 6-1 name filter
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

Limits go in a new `app/_lib/constants/hostApplications.ts`:
- `HOST_APPLICATIONS_PER_USER_PER_DAY = 5`
- `APPLICATION_AREA_MAX = 100`
- `APPLICATION_ADDRESS_MAX = 300`
- `APPLICATION_DESCRIPTION_MIN = 20`
- `APPLICATION_DESCRIPTION_MAX = 2000`
- `APPLICATION_RATE_MAX = 1_000_000`

The name reuses `INQUIRY_NAME_MAX`.

## API (`backend-dev`)

**`POST /api/host-applications`:**

| Case | Result |
| --- | --- |
| Signed out | 401 `UNAUTHENTICATED` |
| Malformed JSON or invalid fields | 400 `VALIDATION`, with `fields` |
| 5 or more applications by this user in the last 24 h | 429 `RATE_LIMITED` |
| Spam trap (`website` non-empty) | 201 `{ received: true }`, nothing saved, no email |
| Otherwise | 201 `{ received: true }`; ops emailed from `after()` |

**Validation:** `app/_lib/hostApplicationValidation.ts` is pure, shared by the form
and the route, and mirrors `inquiryValidation.ts`:
- Every text field is trimmed. A NUL character gives "Remove unsupported characters." Lengths are counted in code points.
- `applicantName` uses the 6-1 name filter. Export `looksOfficial` from `inquiryValidation.ts`, so both validators share one implementation.
- `city` must be one of the 17 `City` values, and `spaceType` a `SpaceType`. Anything else gives "Choose a city." or "Choose a space type."
- `description` shorter than 20 gives "Tell us a little more about the space (at least 20 characters)."
- `hourlyRate`: empty means null. Otherwise it must be a whole number from 1 to 1,000,000, or "Enter a whole number of pesos."
- `confirmsRightToList` must be exactly `true`, or "Confirm that this space is yours to list."

**Write** (`app/_lib/server/hostApplications.ts`): `createHostApplication(user, input, now)`.
- Count the user's applications in the last 24 h. At 5 or more, return `rate-limited`.
- Otherwise create the row: `userId` and `applicantEmail` come from the session, `applicantName` and `address` from the input, and `payload` holds the rest.
- `select: { id: true }`.
- It never creates a `Host` or a `Space`.

**Ops notification** (`app/_lib/server/hostApplicationNotify.ts`), sent from `after()`:
- The address is `env.OPS_EMAIL_TO ?? env.REPORTS_EMAIL_TO`.
- If neither is set, the application is still saved and `[host-application] no OPS_EMAIL_TO` is logged.
- The email reads only `id`, `payload` (for city, type and area) and whether the user is already a linked host.
- Subject: `New host application: {CITY} {SPACE_TYPE}`.
- Text: `Application {id}: {SPACE_TYPE} in {areaName}, {CITY}.`, then `Existing host.` if applicable, then `Review in Prisma Studio.`
- Never the address, name, email or description.
- HTML is escaped. Log lines carry `{ applicationId }` only.

**Rename:** `reportNotify.ts` reads `env.OPS_EMAIL_TO ?? env.REPORTS_EMAIL_TO`, and its log line becomes `[report] no OPS_EMAIL_TO`. `.env.example` and the README name `OPS_EMAIL_TO`, and mention that `REPORTS_EMAIL_TO` still works. The main session edits those two files, because `.env*` is off limits to agents.

**Privacy:** no other query in the app reads `HostApplication`. `address`,
`applicantEmail` and the description never appear in a response, log or email.

## Page (`frontend-dev`)

**`/list-your-space`:** a server component. No `loading.tsx` and no `redirect()`.

- **Intro, always shown:**
  - Iskawt lists private spaces in Metro Manila for shoots.
  - A person checks every space before it goes up.
  - Rates are indicative.
  - Iskawt takes no payment.
  - After applying, we'll email you to talk it through.
- **Signed out:** "Sign in to apply", linking to `/sign-in?next=%2Flist-your-space`.
- **Signed in:** `HostApplicationForm`, a client component.
  - Labelled fields: name, space type, city, area, address, description, hourly rate, and the confirmation checkbox. The spam trap is hidden the way `InquiryForm` hides it.
  - Hints:
    - by the address: "Only the Iskawt team sees this. Listings show just the area and city.";
    - by the rate: "Indicative, in pesos per hour. Nothing is charged here.".
  - Client validation uses the shared validator. Server `fields` errors are shown inline.
  - **On 201** the form is replaced by "Thanks. We'll email you at {email} after we've had a look." The email is the signed-in user's own, from `CurrentUser`. Focus moves to the message, which has `role="status"`.
  - **On 401:** "Your session ended." with a sign-in link back to this page.
  - **On 429:** "You've sent a lot of applications today. Try again tomorrow."
  - **Anything else:** "We couldn't send that. Try again." The typed values are kept.
- **Header:** a "List your space" link in `SiteHeader`, shown signed in and signed out, with a 44px target.
- Metadata title: `List your space — Iskawt`.

## Testing

- **Validator:**
  - every field's bounds and errors;
  - all 17 cities, and a city outside Metro Manila rejected;
  - the type list;
  - the name filter (an "Iskawt Support" name is rejected);
  - NUL characters;
  - code-point counting;
  - rate bounds and non-integers;
  - the permission checkbox not being `true`.
- **Route:**
  - 401, 400 (fields and malformed JSON), 429 and 201;
  - the spam trap saves nothing and sends no email;
  - the exact `create` data, with `userId` and `applicantEmail` from the session;
  - the response body is exactly `{ received: true }`.
- **Notify:**
  - the subject and text;
  - the address, name, email and description are absent from the subject, text and HTML;
  - the `OPS_EMAIL_TO` → `REPORTS_EMAIL_TO` fallback;
  - the unset line;
  - a failed send logs the id only.
- **Report notify:** the same fallback and the renamed log line.
- **Form and page:**
  - signed out shows the prompt and the sign-in link;
  - a signed-in send moves focus to the thanks message;
  - each error;
  - client validation doesn't post;
  - the header link.

## Out of scope

- Photo uploads.
- An applicant-facing status page or "my applications".
- Admin review UI. Ops reviews in Studio.
- Editing an application after sending.
- Automatic creation of `Host` or `Space` rows.
- Phone numbers.

## Size and delivery

- **7a-1, backend:** the schema and migration, `types.ts`, the constants, the validator, `hostApplications.ts`, `hostApplicationNotify.ts`, the route, and the `reportNotify.ts` rename. Each comes with its tests. The main session adds the `.env.example` and README lines.
- **7a-2, frontend:** the page and its styles, `HostApplicationForm` with its styles and tests, and the header link.

Each PR gets its own fresh `reviewer` pass before merge.
