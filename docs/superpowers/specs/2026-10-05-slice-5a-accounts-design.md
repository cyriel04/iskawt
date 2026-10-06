# Slice 5a — Accounts (magic-link sign-in)

Status: design approved in the main session, 2026-10-05. Awaiting spec review.

## Why this slice exists

Slice 5 in PLAN.md was "Inquiries": a form, a stored `Inquiry`, an email to the
host. In brainstorming the scope changed to **real in-app messaging between host
and renter, with accounts for both sides**. That is too big for one slice, so it
splits:

- **5a — Accounts** (this spec): anyone can sign in by email magic link; a host's
  account is linked to their `Host` row. Nothing uses accounts yet.
- **5b — Inquiries and threads**: a signed-in renter sends an inquiry, host and
  renter message each other in the app, email notifies of new messages. Separate
  spec, written after 5a merges.

Browsing (`/`, `/spaces/[slug]`) never requires signing in, in 5a or after.

## Decisions

| Question | Decision |
| --- | --- |
| Sign-in method | Email magic link only. No passwords. |
| Auth library | Better Auth, with its Prisma adapter and magic-link plugin. **New dependency, approved.** |
| Email delivery | Resend's HTTP API via plain `fetch` — no SDK dependency. Console mailer in dev and tests. |
| Host linking | Automatic: on sign-in, a user whose email equals a **verified** `Host.contactEmail` is linked to that host. |
| Rate-limit storage | Database, not memory — memory resets between serverless invocations. |

## Data model

Schema change, agreed as part of the contract before implementation.

- Better Auth's tables — `User`, `Session`, `Account`, `Verification`, `RateLimit` —
  generated with Better Auth's CLI against our schema, then reviewed by hand. They
  follow the existing schema's style (cuid ids, `createdAt`/`updatedAt`), as far
  as Better Auth allows; where it requires its own field names, its names win.
- `Host.userId String? @unique` with a relation to `User`. Nullable: a host exists
  before they ever sign in.
- One migration, created with `pnpm db:migrate`, committed.

**Privacy.** `User.email` is private in the same way `Host.contactEmail` is. It
appears only in the signed-in user's own view of themselves. It never appears in
a public type, an API response about anyone else, or a log line. `Session.token`
and `Verification.value` are never logged.

## Contract — additions to `app/_lib/types.ts`

```ts
// The signed-in user, as they see themselves. Only ever describes the person
// holding the session cookie — never returned for anyone else.
export type CurrentUser = {
	id: string;
	email: string;
	name: string | null;
	host: { displayName: string } | null; // non-null when linked to a verified Host
};
```

Server read: `getCurrentUser(): Promise<CurrentUser | null>` in
`app/_lib/server/currentUser.ts`. It selects explicit fields, never
`include: { host: true }` — that would carry `contactEmail` and `contactPhone`.

New shared constants in `app/_lib/constants/limits.ts`:

```ts
export const MAGIC_LINK_TTL_MINUTES = 15;
export const MAGIC_LINK_REQUESTS_PER_HOUR = 5; // per email address
```

## Backend — `backend-dev`

Files: `app/_lib/server/auth.ts`, `app/_lib/server/mailer.ts`,
`app/_lib/server/currentUser.ts`, `app/api/auth/[...all]/route.ts`,
`prisma/schema.prisma`, one migration.

1. **Spike first.** Install Better Auth, wire the Prisma adapter against our
   generated client (`@/generated/prisma`, driver adapter from `app/_lib/db.ts`),
   and confirm one magic-link round trip works on Next 16.3 + Prisma 7. If it
   doesn't, stop and report — do not work around it.
2. **Auth config** in `auth.ts`: Prisma adapter using the one `PrismaClient` from
   `db.ts`; magic-link plugin with a 15-minute, single-use token; httpOnly,
   `Secure` in production, `SameSite=Lax` session cookie; database rate limiting
   on the sign-in request endpoint, 5 per email per hour.
3. **Mailer** in `mailer.ts`: `interface Mailer { send(msg: { to; subject; text; html }): Promise<void> }`.
   `ResendMailer` POSTs to Resend with `fetch`; `ConsoleMailer` prints the link to
   the server console. Chosen by environment: `ResendMailer` when
   `RESEND_API_KEY` is set, otherwise `ConsoleMailer`. Tests inject a fake. A
   Resend failure surfaces as an error to the sign-in request; it is not swallowed.
4. **Host linking**: a Better Auth hook after a successful sign-in. If
   `user.email` equals the `contactEmail` of a Host with non-null `verifiedAt` and
   null `userId`, set `Host.userId`. Case-insensitive comparison, trimmed. An
   unverified host is never linked. A host already linked to another user is never
   re-linked.
5. **`getCurrentUser()`** reads the session from request headers and returns
   `CurrentUser | null`.
6. **Route**: `app/api/auth/[...all]/route.ts` exports Better Auth's handler.

Environment (the human adds these to `.env`; agents never edit env files):
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`. CI gets
placeholder values the same way it already does for `DATABASE_URL`.

## Frontend — `frontend-dev`

Files: `app/sign-in/page.tsx` (+ module), `app/_components/SignInForm.tsx`
(+ module, test), `app/_components/AccountMenu.tsx` (+ module, test),
`app/_components/SiteHeader.tsx`, `app/_lib/authClient.ts`.

- `/sign-in`: email field, submit. States: idle → sending → "Check your email —
  the link works once and expires in 15 minutes" → error (rate-limited, send
  failed, invalid email). Labelled input, 44px targets, keyboard reachable.
- An expired or used link lands on `/sign-in?error=…` with a plain message and the
  form ready to try again.
- Header: "Sign in" link when signed out. When signed in, an account menu with the
  user's name or email, a "Host" chip when `host` is non-null, and "Sign out".
  The header stays a server component; only the menu is a client component.
- `authClient.ts`: the Better Auth client, used by `SignInForm` and the sign-out
  action only.
- Styling per CLAUDE.md: SCSS modules, theme tokens, no `sx`.

## Testing

Backend:
- linking — verified host with matching email links; unverified host does not;
  different email does not; host already linked to another user is untouched;
  email match is case-insensitive.
- `getCurrentUser` — `null` without a session; returns only the session holder;
  the host part never carries `contactEmail` or `contactPhone` (same key-scan test
  pattern as `spaces.test.ts`).
- mailer — chooses Console vs Resend by env; Resend non-2xx throws.
- rate limit — sixth request in an hour for one email is refused.

Frontend:
- `SignInForm` — each state renders; submit disabled while sending; error text
  for rate limit and invalid email.
- `AccountMenu` — signed out vs signed in vs host.

## PLAN.md changes (made with this slice)

- Slice 5 becomes **5a — Accounts** and **5b — Inquiries and threads**.
- Remove "messaging threads" and "host accounts and auth" from "Deliberately not
  in v1"; note they are in scope as of 2026-10-05.

## Out of scope for 5a

Inquiries, threads and notifications (5b). Profile editing, account deletion,
Google sign-in, any inbox or dashboard, admin UI.

## Open for 5b

Does a renter sign in before writing an inquiry, or write first and confirm via
the emailed link? Decide in the 5b spec.

## Size

Roughly 12–14 files including tests and the migration — over the ~8-file guide.
Split for review as two PRs: **5a-backend** (schema, migration, auth, mailer,
route, `getCurrentUser`) then **5a-frontend** (sign-in page, header, menu),
the frontend built against `CurrentUser` fixtures in parallel.
