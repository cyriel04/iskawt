# Slice 5a — Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone can sign in to Iskawt with an emailed magic link. A signed-in user whose email matches a verified host is linked to that `Host`, and the header shows who is signed in. Browsing never requires signing in.

**Architecture:** Better Auth runs server-side in `app/_lib/server/auth.ts`, using the one `PrismaClient` from `app/_lib/db.ts` through its Prisma adapter and the magic-link plugin. One catch-all route handler, `app/api/auth/[...all]/route.ts`, exposes it. Emails go out through a `Mailer` interface: Resend over plain `fetch` in production, the console in development. Small server modules handle host linking (`hostLink.ts`), the per-email request limit (`signInLimit.ts`) and the signed-in user read (`currentUser.ts`). Each one is unit-tested with Prisma mocked, following the pattern in `spaces.test.ts`. The root layout reads `getCurrentUser()` and passes it to a still-synchronous `SiteHeader`. `AccountMenu` and `SignInForm` are the only new client components.

**Tech Stack:** Next.js 16.3.6 (App Router), React 19.3, MUI 9 + SCSS modules, Prisma 7.10 (`prisma-client` generator, `@prisma/adapter-pg`), **Better Auth (new dependency, approved 2026-10-05)**, Resend HTTP API via `fetch`, Jest 30 + React Testing Library 16.

**Spec:** `docs/superpowers/specs/2026-10-05-slice-5a-accounts-design.md`, plus `CLAUDE.md`, especially **Privacy rules**, **Workflow**, **Styling**, **Prisma 7** and **Definition of done**.

## Global Constraints

- **Ownership.** Tasks 1–5 go to `backend-dev`; Tasks 6–8 go to `frontend-dev`. The main session does Task 0, the contract, and does not write application code.
- **Commits.** Each task ends with a local commit on the current branch. Never `git push`, never `git rebase`. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **The contract is fixed.** `app/_lib/types.ts` is set in Task 0. Don't edit it after that; if a shape seems wrong, stop and report.
- **Files nobody edits by hand:** `prisma/migrations/**` (created only by `pnpm db:migrate`), `generated/**`, lockfiles (changed only by `pnpm add`), `.env*`, `.next/`, `node_modules/`.
- **Dependencies.** The only new one is `better-auth`. No Resend SDK, no `nodemailer`, nothing else. If pnpm blocks a build script, approve it with `pnpm approve-builds` (stored in `pnpm-workspace.yaml`), never `dangerouslyAllowAllBuilds`.
- **Private fields.** `User.email` is private. So are `Host.contactEmail` and `Host.contactPhone`, `Session.token`, `Verification.value`, and every magic-link URL. None of them may appear in a log line, except the magic-link URL printed by `ConsoleMailer` outside production.
- **Explicit `select` on `Host`.** Every `Host` read uses `select`. `include: { host: true }` is a bug.
- **Limits.** A magic link lasts **15 minutes** and works **once**. Each email address gets at most **5 sign-in requests per hour**.
- **TypeScript strict.** No `any`, no `@ts-ignore`, no non-null `!`.
- **Styling.** SCSS modules and tokens from `app/_styles/_tokens.scss` only. No `sx`, no `styled()`, no `style={{}}`. Touch targets are at least 44px.
- **Tests come first.** Run each new test and watch it fail before writing the implementation.
- **Commands.** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Run a single file with `pnpm test -- --runTestsByPath "<path>"`.
- **Server-module tests** start with `/** @jest-environment node */` and mock `@/app/_lib/db` the way `app/_lib/server/spaces.test.ts` does. They never import `better-auth`; they mock `@/app/_lib/server/auth` instead.

## Contract deviation needing approval before Task 1

The spec relies on Better Auth's rate limiter, but that limiter keys on **IP address and path**, not email. Enforcing "5 per email per hour" needs a row per request. This plan adds one small model, `SignInRequest { id, email, createdAt }`, written and counted in `signInLimit.ts`. Better Auth's own limiter also stays on, keyed by IP, for the same route. **Approve this model, or choose IP-only limiting, before Task 1 starts.**

## Review Focus

1. **Mixed-case or padded email.** `"  Host@Example.com "` signs in to the same account as `host@example.com` and links the same host. Test: Task 3.
2. **Two hosts whose `contactEmail` differ only by case.** Linking is ambiguous, so nothing is linked. A human sorts it out in Prisma Studio. Test: Task 3.
3. **Resend is down or returns non-2xx.** The renter sees "We couldn't send the email — try again", never "Check your email". Tests: Task 2 (mailer throws) and Task 7 (form error state).
4. **Production with no `RESEND_API_KEY`.** Sending throws instead of logging a live sign-in link to production logs. Test: Task 2.
5. **An expired, used or unknown link error code in the URL.** `/sign-in?error=…` shows a plain-English message and never echoes the raw code or any other query text. Test: Task 7.

---

## Part A — contract (main session)

### Task 0: Contract — `CurrentUser` type and limit constants

**Files:**
- Modify: `app/_lib/types.ts` (append)
- Modify: `app/_lib/constants/limits.ts` (append)

- [ ] **Step 1: Append to `app/_lib/types.ts`**

```ts
// ---------------------------------------------------------------- accounts

// The signed-in user, as they see themselves. Only ever describes the person
// holding the session cookie, never anyone else. Better Auth stores an empty
// name for magic-link sign-ups; the query layer maps "" to null.
export type CurrentUser = {
	id: string;
	email: string;
	name: string | null;
	host: { displayName: string } | null; // set when linked to a verified Host
};
```

- [ ] **Step 2: Append to `app/_lib/constants/limits.ts`**

```ts
export const MAGIC_LINK_TTL_MINUTES = 15;
export const MAGIC_LINK_REQUESTS_PER_HOUR = 5; // per email address
```

- [ ] **Step 3:** Run `pnpm typecheck`. Expected: clean.
- [ ] **Step 4: Commit:** `feat(contract): CurrentUser type and magic-link limits`

---

## Part B — backend (`backend-dev`), PR "Slice 5a — accounts backend"

### Task 1: Spike — Better Auth on Next 16.3 + Prisma 7, plus the schema

Do this task before anything else. **If the round trip in Step 6 fails, stop and report. Do not work around it.**

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (via `pnpm add better-auth` only)
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_accounts/` (via `pnpm db:migrate` only)
- Create: `app/_lib/server/auth.ts` (a minimal version; Task 4 completes it)
- Create: `app/api/auth/[...all]/route.ts`
- Modify: `.github/workflows/ci.yml` (placeholder env vars)

**Interfaces:**
- Produces: `export const auth` from `@/app/_lib/server/auth`, and Prisma models `User`, `Session`, `Account`, `Verification`, `RateLimit`, `SignInRequest`, plus `Host.userId`.

- [ ] **Step 1: Install.** Run `pnpm add better-auth`. Record the installed version in the commit message.

- [ ] **Step 2: Add the models to `prisma/schema.prisma`** in a new `// ---------------------------------------------------------------- accounts` section after `HostApplication`. Better Auth generates its own string ids, so its models take `id String @id` with no default. Field names are Better Auth's own and must not be renamed.

```prisma
// ---------------------------------------------------------------- accounts
//
// Better Auth's tables (magic-link sign-in). Field names are Better Auth's and
// must not change. User.email is PRIVATE in the same way Host.contactEmail is:
// only ever shown to the user themselves.

model User {
  id            String   @id
  name          String   // Better Auth stores "" for magic-link sign-ups
  email         String   @unique
  emailVerified Boolean  @default(false)
  image         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  sessions Session[]
  accounts Account[]
  host     Host?
}

model Session {
  id        String   @id
  token     String   @unique // PRIVATE. Never logged.
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([userId])
}

model Verification {
  id         String   @id
  identifier String
  value      String   // PRIVATE. Never logged.
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
}

model RateLimit {
  id          String @id
  key         String @unique
  count       Int
  lastRequest BigInt
}

// One row per magic-link request, for the per-email limit in
// app/_lib/server/signInLimit.ts. Better Auth's RateLimit keys on IP, not email.
model SignInRequest {
  id        String   @id @default(cuid())
  email     String   // PRIVATE. Lowercased, trimmed.
  createdAt DateTime @default(now())

  @@index([email, createdAt])
}
```

  Then add this to `model Host`, after `verifiedAt`:

```prisma
  // Set automatically when a user signs in with this host's contactEmail and
  // the host is verified. See app/_lib/server/hostLink.ts.
  userId String? @unique
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
```

- [ ] **Step 3: Cross-check against Better Auth.** Run `pnpm dlx @better-auth/cli generate --config app/_lib/server/auth.ts --output <scratch path>`. Compare the output with Step 2, field by field. If Better Auth's version needs a field Step 2 lacks, or names one differently, Better Auth wins. Note each difference in the commit message. Don't commit the generated file.

- [ ] **Step 4: Write the minimal `app/_lib/server/auth.ts`**

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { prisma } from "@/app/_lib/db";
import { MAGIC_LINK_TTL_MINUTES } from "@/app/_lib/constants/limits";

export const auth = betterAuth({
	database: prismaAdapter(prisma, { provider: "postgresql" }),
	plugins: [
		magicLink({
			expiresIn: MAGIC_LINK_TTL_MINUTES * 60,
			// Spike only: replaced by the Mailer in Task 4.
			sendMagicLink: async ({ url }) => {
				console.info(`[dev] magic link: ${url}`);
			},
		}),
		nextCookies(), // must stay last
	],
});
```

- [ ] **Step 5: Create `app/api/auth/[...all]/route.ts`**

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/app/_lib/server/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 6: Migrate and check the round trip.** Run `pnpm db:migrate --name accounts` against local Docker Postgres, then `pnpm dev`. Then:
  1. `curl -s -X POST localhost:3000/api/auth/sign-in/magic-link -H 'content-type: application/json' -d '{"email":"demo-user@example.invalid"}'`. Expected: 200, and a `[dev] magic link:` line in the dev server log.
  2. Open that URL with `curl -si`. Expected: a 302 that sets a `better-auth.session_token` cookie.
  3. Send that cookie to `curl -s localhost:3000/api/auth/get-session`. Expected: JSON with `user.email` equal to `demo-user@example.invalid`.

  If any step fails, stop and report the exact error.

- [ ] **Step 7: CI placeholders.** In `.github/workflows/ci.yml`, add these to the `env` of **both** jobs, next to `DATABASE_URL`, with a comment saying they are placeholders and nothing is sent:

```yaml
      BETTER_AUTH_SECRET: ci-placeholder-secret-not-used-for-anything-real
      BETTER_AUTH_URL: http://localhost:3000
```

- [ ] **Step 8: Verify.** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. All exit 0.
- [ ] **Step 9: Commit:** `feat(auth): Better Auth spike, accounts schema and migration`, with the Better Auth version and any schema differences from Step 3 in the body.

### Task 2: Mailer

**Files:**
- Create: `app/_lib/server/mailer.ts`
- Test: `app/_lib/server/mailer.test.ts`

**Interfaces:**
- Produces:
  - `export type MailMessage = { to: string; subject: string; text: string; html: string }`
  - `export interface Mailer { send(message: MailMessage): Promise<void> }`
  - `export class ResendMailer implements Mailer` (constructor `(apiKey: string, from: string, fetchImpl: typeof fetch = fetch)`)
  - `export class ConsoleMailer implements Mailer`
  - `export function getMailer(env: NodeJS.ProcessEnv = process.env): Mailer`

- [ ] **Step 1: Write the failing test** `app/_lib/server/mailer.test.ts`

```ts
/** @jest-environment node */
import { ConsoleMailer, ResendMailer, getMailer } from "@/app/_lib/server/mailer";

const message = {
	to: "demo-user@example.invalid",
	subject: "Sign in to Iskawt",
	text: "Link: https://example.invalid/x",
	html: "<p>Link</p>",
};

describe("ResendMailer", () => {
	it("POSTs the message to Resend with the API key", async () => {
		const fetchImpl = jest.fn().mockResolvedValue(new Response("{}", { status: 200 }));
		await new ResendMailer("re_test", "Iskawt <hello@example.invalid>", fetchImpl).send(message);
		expect(fetchImpl).toHaveBeenCalledWith(
			"https://api.resend.com/emails",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({ Authorization: "Bearer re_test" }),
			}),
		);
		const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
		expect(body).toEqual({
			from: "Iskawt <hello@example.invalid>",
			to: ["demo-user@example.invalid"],
			subject: "Sign in to Iskawt",
			text: message.text,
			html: message.html,
		});
	});

	it("throws on a non-2xx response, without the recipient in the error", async () => {
		const fetchImpl = jest.fn().mockResolvedValue(new Response("down", { status: 503 }));
		const send = new ResendMailer("re_test", "from@example.invalid", fetchImpl).send(message);
		await expect(send).rejects.toThrow("Resend responded 503");
		await expect(send).rejects.not.toThrow(/demo-user/);
	});
});

describe("getMailer", () => {
	it("uses Resend when RESEND_API_KEY and EMAIL_FROM are set", () => {
		const env = { NODE_ENV: "production", RESEND_API_KEY: "re_x", EMAIL_FROM: "a@example.invalid" } as NodeJS.ProcessEnv;
		expect(getMailer(env)).toBeInstanceOf(ResendMailer);
	});

	it("uses the console outside production when no key is set", () => {
		expect(getMailer({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBeInstanceOf(ConsoleMailer);
	});

	it("refuses to fall back to the console in production", () => {
		expect(() => getMailer({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(
			"RESEND_API_KEY and EMAIL_FROM are required in production",
		);
	});
});
```

- [ ] **Step 2:** Run `pnpm test -- --runTestsByPath app/_lib/server/mailer.test.ts`. Expected: FAIL, because the module can't be found.

- [ ] **Step 3: Implement `app/_lib/server/mailer.ts`**

```ts
// Outgoing email. Resend's HTTP API via fetch in production (no SDK), the
// console in development. Tests construct mailers directly.

export type MailMessage = { to: string; subject: string; text: string; html: string };

export interface Mailer {
	send(message: MailMessage): Promise<void>;
}

export class ResendMailer implements Mailer {
	constructor(
		private readonly apiKey: string,
		private readonly from: string,
		private readonly fetchImpl: typeof fetch = fetch,
	) {}

	async send(message: MailMessage): Promise<void> {
		const response = await this.fetchImpl("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				from: this.from,
				to: [message.to],
				subject: message.subject,
				text: message.text,
				html: message.html,
			}),
		});
		// Never include the recipient or body: errors end up in logs.
		if (!response.ok) throw new Error(`Resend responded ${response.status}`);
	}
}

// Development only. Prints the message so the sign-in link can be clicked
// from the terminal. getMailer never returns this in production.
export class ConsoleMailer implements Mailer {
	async send(message: MailMessage): Promise<void> {
		console.info(`[dev mail] ${message.subject}\n${message.text}`);
	}
}

export function getMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
	if (env.RESEND_API_KEY && env.EMAIL_FROM) return new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM);
	if (env.NODE_ENV === "production") throw new Error("RESEND_API_KEY and EMAIL_FROM are required in production");
	return new ConsoleMailer();
}
```

- [ ] **Step 4:** Run the test again. Expected: PASS (5 tests).
- [ ] **Step 5: Commit:** `feat(auth): Mailer with Resend over fetch and a dev console fallback`

### Task 3: Host linking and the per-email limit

**Files:**
- Create: `app/_lib/server/hostLink.ts`, `app/_lib/server/signInLimit.ts`
- Test: `app/_lib/server/hostLink.test.ts`, `app/_lib/server/signInLimit.test.ts`

**Interfaces:**
- Produces:
  - `export function normalizeEmail(email: string): string` (in `signInLimit.ts`)
  - `export async function linkHostForUser(user: { id: string; email: string }): Promise<"linked" | "already-linked" | "no-match" | "ambiguous">`
  - `export async function recordSignInRequest(email: string, now?: Date): Promise<boolean>`, which returns `false` once the limit is reached and writes no row in that case

- [ ] **Step 1: Write the failing test** `app/_lib/server/hostLink.test.ts`

```ts
/** @jest-environment node */
const mockHostFindFirst = jest.fn();
const mockHostFindMany = jest.fn();
const mockHostUpdate = jest.fn();

jest.mock("@/app/_lib/db", () => ({
	prisma: {
		host: {
			findFirst: (...a: unknown[]) => mockHostFindFirst(...a),
			findMany: (...a: unknown[]) => mockHostFindMany(...a),
			update: (...a: unknown[]) => mockHostUpdate(...a),
		},
	},
}));

import { linkHostForUser } from "@/app/_lib/server/hostLink";

const user = { id: "user_demo", email: "  Demo-Host-A@Example.invalid " };

beforeEach(() => {
	jest.resetAllMocks();
	mockHostFindFirst.mockResolvedValue(null); // user not yet linked to anything
});

it("links the single verified, unlinked host whose email matches, ignoring case and spaces", async () => {
	mockHostFindMany.mockResolvedValue([{ id: "host_a" }]);
	await expect(linkHostForUser(user)).resolves.toBe("linked");
	expect(mockHostFindMany).toHaveBeenCalledWith({
		where: {
			contactEmail: { equals: "demo-host-a@example.invalid", mode: "insensitive" },
			verifiedAt: { not: null },
			userId: null,
		},
		select: { id: true },
		take: 2,
	});
	expect(mockHostUpdate).toHaveBeenCalledWith({
		where: { id: "host_a", userId: null },
		data: { userId: "user_demo" },
		select: { id: true },
	});
});

it("does nothing when no verified, unlinked host matches (unverified or other email)", async () => {
	mockHostFindMany.mockResolvedValue([]);
	await expect(linkHostForUser(user)).resolves.toBe("no-match");
	expect(mockHostUpdate).not.toHaveBeenCalled();
});

it("does nothing when two hosts match case-insensitively", async () => {
	mockHostFindMany.mockResolvedValue([{ id: "host_a" }, { id: "host_b" }]);
	await expect(linkHostForUser(user)).resolves.toBe("ambiguous");
	expect(mockHostUpdate).not.toHaveBeenCalled();
});

it("does nothing when the user is already linked to a host", async () => {
	mockHostFindFirst.mockResolvedValue({ id: "host_a" });
	await expect(linkHostForUser(user)).resolves.toBe("already-linked");
	expect(mockHostFindMany).not.toHaveBeenCalled();
});

it("never selects contact fields", async () => {
	mockHostFindMany.mockResolvedValue([{ id: "host_a" }]);
	await linkHostForUser(user);
	const calls = [...mockHostFindFirst.mock.calls, ...mockHostFindMany.mock.calls, ...mockHostUpdate.mock.calls];
	for (const [args] of calls) {
		expect(JSON.stringify((args as { select: unknown }).select)).not.toMatch(/contact/);
	}
});
```

- [ ] **Step 2: Write the failing test** `app/_lib/server/signInLimit.test.ts`

```ts
/** @jest-environment node */
const mockCount = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/app/_lib/db", () => ({
	prisma: {
		signInRequest: {
			count: (...a: unknown[]) => mockCount(...a),
			create: (...a: unknown[]) => mockCreate(...a),
		},
	},
}));

import { normalizeEmail, recordSignInRequest } from "@/app/_lib/server/signInLimit";
import { MAGIC_LINK_REQUESTS_PER_HOUR } from "@/app/_lib/constants/limits";

const now = new Date("2026-10-05T10:00:00Z");

beforeEach(() => jest.resetAllMocks());

it("normalizes email by trimming and lowercasing", () => {
	expect(normalizeEmail("  Demo@Example.INVALID ")).toBe("demo@example.invalid");
});

it("allows and records a request under the limit", async () => {
	mockCount.mockResolvedValue(MAGIC_LINK_REQUESTS_PER_HOUR - 1);
	await expect(recordSignInRequest(" Demo@Example.invalid", now)).resolves.toBe(true);
	expect(mockCount).toHaveBeenCalledWith({
		where: { email: "demo@example.invalid", createdAt: { gt: new Date("2026-10-05T09:00:00Z") } },
	});
	expect(mockCreate).toHaveBeenCalledWith({ data: { email: "demo@example.invalid" }, select: { id: true } });
});

it("refuses the request once the hourly limit is reached, and records nothing", async () => {
	mockCount.mockResolvedValue(MAGIC_LINK_REQUESTS_PER_HOUR);
	await expect(recordSignInRequest("demo@example.invalid", now)).resolves.toBe(false);
	expect(mockCreate).not.toHaveBeenCalled();
});
```

- [ ] **Step 3:** Run both test files. Expected: FAIL, because the modules can't be found.

- [ ] **Step 4: Implement `app/_lib/server/signInLimit.ts`**

```ts
import { prisma } from "@/app/_lib/db";
import { MAGIC_LINK_REQUESTS_PER_HOUR } from "@/app/_lib/constants/limits";

const HOUR_MS = 60 * 60 * 1000;

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

// Per-email cap on magic-link requests, so nobody can flood someone else's
// inbox. Better Auth's own limiter keys on IP and stays on as well.
export async function recordSignInRequest(email: string, now: Date = new Date()): Promise<boolean> {
	const normalized = normalizeEmail(email);
	const recent = await prisma.signInRequest.count({
		where: { email: normalized, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
	});
	if (recent >= MAGIC_LINK_REQUESTS_PER_HOUR) return false;
	await prisma.signInRequest.create({ data: { email: normalized }, select: { id: true } });
	return true;
}
```

- [ ] **Step 5: Implement `app/_lib/server/hostLink.ts`**

```ts
import { prisma } from "@/app/_lib/db";
import { normalizeEmail } from "@/app/_lib/server/signInLimit";

export type HostLinkResult = "linked" | "already-linked" | "no-match" | "ambiguous";

// Runs after every sign-in. Links the user to a Host when the magic link has
// proved they control that host's contactEmail, and only when a human has
// verified the host. Selects ids only: contact fields never leave the database.
export async function linkHostForUser(user: { id: string; email: string }): Promise<HostLinkResult> {
	const existing = await prisma.host.findFirst({ where: { userId: user.id }, select: { id: true } });
	if (existing) return "already-linked";

	const matches = await prisma.host.findMany({
		where: {
			contactEmail: { equals: normalizeEmail(user.email), mode: "insensitive" },
			verifiedAt: { not: null },
			userId: null,
		},
		select: { id: true },
		take: 2,
	});
	if (matches.length === 0) return "no-match";
	// Two hosts differing only by case: a human decides, not this code.
	if (matches.length > 1) return "ambiguous";

	// `userId: null` in the where keeps a concurrent sign-in from re-linking.
	await prisma.host.update({
		where: { id: matches[0].id, userId: null },
		data: { userId: user.id },
		select: { id: true },
	});
	return "linked";
}
```

  If `pnpm typecheck` rejects `userId: null` inside `update`'s `where`, use `updateMany` with the same `where` and `data` instead, and change the test to match. Don't cast.

- [ ] **Step 6:** Run both test files. Expected: PASS (8 tests).
- [ ] **Step 7: Commit:** `feat(auth): host linking by verified email and per-email sign-in limit`

### Task 4: Wire the mailer, limit and linking into Better Auth

**Files:**
- Modify: `app/_lib/server/auth.ts`
- Create: `app/_lib/server/magicLinkEmail.ts`
- Test: `app/_lib/server/magicLinkEmail.test.ts`

**Interfaces:**
- Consumes: `getMailer`, `recordSignInRequest`, `linkHostForUser` from Tasks 2–3.
- Produces: `export function magicLinkEmail(to: string, url: string): MailMessage`, plus a complete `auth`.

- [ ] **Step 1: Write the failing test** `app/_lib/server/magicLinkEmail.test.ts`

```ts
/** @jest-environment node */
import { magicLinkEmail } from "@/app/_lib/server/magicLinkEmail";

it("builds the sign-in email with the link, expiry and site name", () => {
	const msg = magicLinkEmail("demo-user@example.invalid", "https://iskawt.example.invalid/api/auth/magic-link/verify?token=t");
	expect(msg.to).toBe("demo-user@example.invalid");
	expect(msg.subject).toBe("Sign in to Iskawt");
	expect(msg.text).toContain("https://iskawt.example.invalid/api/auth/magic-link/verify?token=t");
	expect(msg.text).toContain("15 minutes");
	expect(msg.html).toContain('href="https://iskawt.example.invalid/api/auth/magic-link/verify?token=t"');
});

it("escapes the URL in HTML", () => {
	const msg = magicLinkEmail("a@example.invalid", 'https://x.invalid/?a=1&b="2"');
	expect(msg.html).toContain("https://x.invalid/?a=1&amp;b=&quot;2&quot;");
});
```

- [ ] **Step 2:** Run it. Expected: FAIL, because the module can't be found.

- [ ] **Step 3: Implement `app/_lib/server/magicLinkEmail.ts`**

```ts
import { SITE_NAME } from "@/app/_lib/constants/site";
import { MAGIC_LINK_TTL_MINUTES } from "@/app/_lib/constants/limits";
import type { MailMessage } from "@/app/_lib/server/mailer";

function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function magicLinkEmail(to: string, url: string): MailMessage {
	const expiry = `This link works once and expires in ${MAGIC_LINK_TTL_MINUTES} minutes.`;
	const ignore = "If you didn't ask to sign in, you can ignore this email.";
	return {
		to,
		subject: `Sign in to ${SITE_NAME}`,
		text: `Sign in to ${SITE_NAME}:\n${url}\n\n${expiry}\n${ignore}`,
		html: `<p><a href="${escapeHtml(url)}">Sign in to ${SITE_NAME}</a></p><p>${expiry}</p><p>${ignore}</p>`,
	};
}
```

- [ ] **Step 4: Replace `app/_lib/server/auth.ts`**

```ts
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { prisma } from "@/app/_lib/db";
import { MAGIC_LINK_REQUESTS_PER_HOUR, MAGIC_LINK_TTL_MINUTES } from "@/app/_lib/constants/limits";
import { getMailer } from "@/app/_lib/server/mailer";
import { magicLinkEmail } from "@/app/_lib/server/magicLinkEmail";
import { recordSignInRequest } from "@/app/_lib/server/signInLimit";
import { linkHostForUser } from "@/app/_lib/server/hostLink";

export const auth = betterAuth({
	database: prismaAdapter(prisma, { provider: "postgresql" }),
	// IP-keyed limit on the sign-in request route, stored in the database so it
	// holds across serverless instances. The per-email limit is in signInLimit.ts.
	rateLimit: {
		enabled: true,
		storage: "database",
		customRules: { "/sign-in/magic-link": { window: 60 * 60, max: MAGIC_LINK_REQUESTS_PER_HOUR } },
	},
	databaseHooks: {
		session: {
			create: {
				after: async (session) => {
					const user = await prisma.user.findUnique({
						where: { id: session.userId },
						select: { id: true, email: true },
					});
					if (user) await linkHostForUser(user);
				},
			},
		},
	},
	plugins: [
		magicLink({
			expiresIn: MAGIC_LINK_TTL_MINUTES * 60,
			sendMagicLink: async ({ email, url }) => {
				if (!(await recordSignInRequest(email))) {
					throw new APIError("TOO_MANY_REQUESTS", { message: "Too many sign-in requests. Try again in an hour." });
				}
				await getMailer().send(magicLinkEmail(email, url));
			},
		}),
		nextCookies(), // must stay last
	],
});
```

  If the installed Better Auth uses different option names (`databaseHooks.session.create.after`, `rateLimit.customRules`, `APIError`), follow its docs in `node_modules/better-auth`. Keep the same behaviour and report the difference.

- [ ] **Step 5: Manual check** (`pnpm dev`, ConsoleMailer):
  - Six POSTs for the same email in a row. Expected: the sixth returns 429.
  - Set a seeded verified demo host's `contactEmail` to `demo-user@example.invalid` in Prisma Studio, then sign in. Expected: `Host.userId` is now set.
  - Open the same magic link a second time. Expected: a redirect with an error, and no new session.

- [ ] **Step 6:** Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Expected: all clean.
- [ ] **Step 7: Commit:** `feat(auth): send magic links through the Mailer, limit per email, link hosts on sign-in`

### Task 5: `getCurrentUser`

**Files:**
- Create: `app/_lib/server/currentUser.ts`
- Test: `app/_lib/server/currentUser.test.ts`

**Interfaces:**
- Consumes: `auth.api.getSession({ headers })`.
- Produces: `export async function getCurrentUser(): Promise<CurrentUser | null>`.

- [ ] **Step 1: Write the failing test** `app/_lib/server/currentUser.test.ts`

```ts
/** @jest-environment node */
const mockGetSession = jest.fn();
const mockUserFindUnique = jest.fn();

jest.mock("next/headers", () => ({ headers: async () => new Headers() }));
jest.mock("@/app/_lib/server/auth", () => ({
	auth: { api: { getSession: (...a: unknown[]) => mockGetSession(...a) } },
}));
jest.mock("@/app/_lib/db", () => ({
	prisma: { user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) } },
}));

import { getCurrentUser } from "@/app/_lib/server/currentUser";

beforeEach(() => jest.resetAllMocks());

it("returns null without a session", async () => {
	mockGetSession.mockResolvedValue(null);
	await expect(getCurrentUser()).resolves.toBeNull();
	expect(mockUserFindUnique).not.toHaveBeenCalled();
});

it("returns the session holder, with '' name mapped to null and no host", async () => {
	mockGetSession.mockResolvedValue({ user: { id: "user_demo" } });
	mockUserFindUnique.mockResolvedValue({ id: "user_demo", email: "demo-user@example.invalid", name: "", host: null });
	await expect(getCurrentUser()).resolves.toEqual({
		id: "user_demo",
		email: "demo-user@example.invalid",
		name: null,
		host: null,
	});
	expect(mockUserFindUnique).toHaveBeenCalledWith({
		where: { id: "user_demo" },
		select: { id: true, email: true, name: true, host: { select: { displayName: true, verifiedAt: true } } },
	});
});

it("includes the linked host's display name only while it is verified", async () => {
	mockGetSession.mockResolvedValue({ user: { id: "u" } });
	mockUserFindUnique.mockResolvedValue({
		id: "u",
		email: "a@example.invalid",
		name: "Demo",
		host: { displayName: "Demo Host A", verifiedAt: new Date() },
	});
	await expect(getCurrentUser()).resolves.toMatchObject({ host: { displayName: "Demo Host A" } });

	mockUserFindUnique.mockResolvedValue({
		id: "u",
		email: "a@example.invalid",
		name: "Demo",
		host: { displayName: "Demo Host A", verifiedAt: null },
	});
	await expect(getCurrentUser()).resolves.toMatchObject({ host: null });
});

it("never carries host contact fields, even if the row has them", async () => {
	mockGetSession.mockResolvedValue({ user: { id: "u" } });
	mockUserFindUnique.mockResolvedValue({
		id: "u",
		email: "a@example.invalid",
		name: "Demo",
		host: { displayName: "Demo Host A", verifiedAt: new Date(), contactEmail: "x@example.invalid", contactPhone: "0000" },
	});
	const json = JSON.stringify(await getCurrentUser());
	expect(json).not.toMatch(/contactEmail|contactPhone|verifiedAt|x@example/);
});
```

- [ ] **Step 2:** Run it. Expected: FAIL, because the module can't be found.

- [ ] **Step 3: Implement `app/_lib/server/currentUser.ts`**

```ts
import { headers } from "next/headers";
import { prisma } from "@/app/_lib/db";
import { auth } from "@/app/_lib/server/auth";
import type { CurrentUser } from "@/app/_lib/types";

// The signed-in user, for their own header and pages. Explicit select: the
// Host relation must never carry contactEmail or contactPhone.
export async function getCurrentUser(): Promise<CurrentUser | null> {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) return null;

	const row = await prisma.user.findUnique({
		where: { id: session.user.id },
		select: { id: true, email: true, name: true, host: { select: { displayName: true, verifiedAt: true } } },
	});
	if (!row) return null;

	return {
		id: row.id,
		email: row.email,
		name: row.name.trim() === "" ? null : row.name,
		host: row.host && row.host.verifiedAt ? { displayName: row.host.displayName } : null,
	};
}
```

- [ ] **Step 4:** Run it again. Expected: PASS (4 tests). Then run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- [ ] **Step 5: Commit:** `feat(auth): getCurrentUser with explicit host select`
- [ ] **Step 6: Checkpoint.** Send the Part B diff to a fresh `reviewer` agent. Fix its findings before Part C merges.

---

## Part C — frontend (`frontend-dev`), PR "Slice 5a — sign-in UI"

Part C may run in parallel with Part B, after Task 0. Its tests mock `@/app/_lib/authClient` and use fixtures, so they don't need the backend.

### Task 6: Auth client and fixtures

**Files:**
- Create: `app/_lib/authClient.ts`
- Modify: `app/_components/testing.tsx` (add fixtures)

**Interfaces:**
- Produces:
  - `export const authClient` from `@/app/_lib/authClient`, with `authClient.signIn.magicLink({ email, callbackURL, errorCallbackURL })` and `authClient.signOut()`, each resolving to `{ data, error: { status: number; message?: string } | null }`
  - Fixtures: `demoUser: CurrentUser` and `demoHostUser: CurrentUser`

- [ ] **Step 1: Write `app/_lib/authClient.ts`.** This needs `better-auth` installed (Task 1, Step 1). If Part C runs ahead of Task 1, run `pnpm add better-auth` here instead; it's the same approved dependency.

```ts
"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

// Browser side of Better Auth. Used by SignInForm and AccountMenu only.
export const authClient = createAuthClient({ plugins: [magicLinkClient()] });
```

- [ ] **Step 2: Append to `app/_components/testing.tsx`** (and add `CurrentUser` to its type import)

```ts
export const demoUser: CurrentUser = {
	id: "user_demo",
	email: "demo-user@example.invalid",
	name: null,
	host: null,
};

export const demoHostUser: CurrentUser = {
	id: "user_demo_host",
	email: "demo-host-a@example.invalid",
	name: "Demo Host A",
	host: { displayName: "Demo Host A" },
};
```

- [ ] **Step 3:** Run `pnpm typecheck`. Expected: clean.
- [ ] **Step 4: Commit:** `feat(auth-ui): auth client and CurrentUser fixtures`

### Task 7: `/sign-in` page and `SignInForm`

**Files:**
- Create: `app/_components/SignInForm.tsx`, `app/_components/SignInForm.module.scss`, `app/_components/SignInForm.test.tsx`
- Create: `app/sign-in/page.tsx`, `app/sign-in/page.module.scss`

**Interfaces:**
- Consumes: `authClient.signIn.magicLink`.
- Produces: `export default function SignInForm({ linkError }: { linkError: "expired" | "invalid" | null })` and `export function linkErrorFrom(raw: string | string[] | undefined): "expired" | "invalid" | null`, both in `SignInForm.tsx`.

- [ ] **Step 1: Write the failing test** `app/_components/SignInForm.test.tsx`

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/app/_components/testing";

const mockMagicLink = jest.fn();
jest.mock("@/app/_lib/authClient", () => ({
	authClient: { signIn: { magicLink: (...a: unknown[]) => mockMagicLink(...a) } },
}));

import SignInForm, { linkErrorFrom } from "@/app/_components/SignInForm";

beforeEach(() => mockMagicLink.mockReset());

async function submit(email: string) {
	await userEvent.type(screen.getByLabelText("Email address"), email);
	await userEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
}

it("sends the link and shows the check-your-email state", async () => {
	mockMagicLink.mockResolvedValue({ data: { status: true }, error: null });
	renderWithTheme(<SignInForm linkError={null} />);
	await submit("demo-user@example.invalid");
	expect(mockMagicLink).toHaveBeenCalledWith({
		email: "demo-user@example.invalid",
		callbackURL: "/",
		errorCallbackURL: "/sign-in",
	});
	expect(await screen.findByRole("status")).toHaveTextContent(
		"Check your email. The link works once and expires in 15 minutes.",
	);
});

it("disables the button while sending", async () => {
	let resolve: (v: unknown) => void = () => {};
	mockMagicLink.mockReturnValue(new Promise((r) => (resolve = r)));
	renderWithTheme(<SignInForm linkError={null} />);
	await submit("demo-user@example.invalid");
	expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
	resolve({ data: {}, error: null });
	await screen.findByRole("status");
});

it("explains the rate limit", async () => {
	mockMagicLink.mockResolvedValue({ data: null, error: { status: 429 } });
	renderWithTheme(<SignInForm linkError={null} />);
	await submit("demo-user@example.invalid");
	expect(await screen.findByRole("alert")).toHaveTextContent("Too many sign-in emails. Try again in an hour.");
});

it("says the email could not be sent when the server fails, not 'check your email'", async () => {
	mockMagicLink.mockResolvedValue({ data: null, error: { status: 500 } });
	renderWithTheme(<SignInForm linkError={null} />);
	await submit("demo-user@example.invalid");
	expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't send the email. Try again.");
	expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("rejects an invalid email without calling the server", async () => {
	renderWithTheme(<SignInForm linkError={null} />);
	await submit("not-an-email");
	expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
	expect(mockMagicLink).not.toHaveBeenCalled();
});

it("shows an expired-link message with the form ready", () => {
	renderWithTheme(<SignInForm linkError="expired" />);
	expect(screen.getByRole("alert")).toHaveTextContent("That link has expired or was already used. Send a new one.");
	expect(screen.getByLabelText("Email address")).toBeEnabled();
});

describe("linkErrorFrom", () => {
	it("maps Better Auth codes and never echoes unknown input", () => {
		expect(linkErrorFrom("EXPIRED_TOKEN")).toBe("expired");
		expect(linkErrorFrom("INVALID_TOKEN")).toBe("invalid");
		expect(linkErrorFrom("<script>alert(1)</script>")).toBe("invalid");
		expect(linkErrorFrom(["EXPIRED_TOKEN", "x"])).toBe("expired");
		expect(linkErrorFrom(undefined)).toBeNull();
	});
});
```

- [ ] **Step 2:** Run `pnpm test -- --runTestsByPath app/_components/SignInForm.test.tsx`. Expected: FAIL, because the module can't be found.

- [ ] **Step 3: Implement `app/_components/SignInForm.tsx`**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { authClient } from "@/app/_lib/authClient";
import { MAGIC_LINK_TTL_MINUTES } from "@/app/_lib/constants/limits";
import styles from "./SignInForm.module.scss";

export type LinkError = "expired" | "invalid";

// Maps ?error= from Better Auth's redirect to a fixed set. The raw value is
// never rendered.
export function linkErrorFrom(raw: string | string[] | undefined): LinkError | null {
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (!value) return null;
	return value === "EXPIRED_TOKEN" ? "expired" : "invalid";
}

const LINK_ERROR_TEXT: Record<LinkError, string> = {
	expired: "That link has expired or was already used. Send a new one.",
	invalid: "That sign-in link didn't work. Send a new one.",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type State =
	| { kind: "idle" }
	| { kind: "sending" }
	| { kind: "sent" }
	| { kind: "error"; message: string };

export default function SignInForm({ linkError }: { linkError: LinkError | null }) {
	const [email, setEmail] = useState("");
	const [invalid, setInvalid] = useState(false);
	const [state, setState] = useState<State>(
		linkError ? { kind: "error", message: LINK_ERROR_TEXT[linkError] } : { kind: "idle" },
	);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const trimmed = email.trim();
		if (!EMAIL_PATTERN.test(trimmed)) {
			setInvalid(true);
			return;
		}
		setInvalid(false);
		setState({ kind: "sending" });
		const { error } = await authClient.signIn.magicLink({
			email: trimmed,
			callbackURL: "/",
			errorCallbackURL: "/sign-in",
		});
		if (!error) setState({ kind: "sent" });
		else if (error.status === 429) setState({ kind: "error", message: "Too many sign-in emails. Try again in an hour." });
		else setState({ kind: "error", message: "We couldn't send the email. Try again." });
	}

	if (state.kind === "sent") {
		return (
			<p role="status" className={styles.sent}>
				Check your email. The link works once and expires in {MAGIC_LINK_TTL_MINUTES} minutes.
			</p>
		);
	}

	const sending = state.kind === "sending";
	return (
		<form noValidate onSubmit={onSubmit} className={styles.form}>
			{state.kind === "error" && <Alert severity="error">{state.message}</Alert>}
			<TextField
				label="Email address"
				type="email"
				autoComplete="email"
				value={email}
				onChange={(e) => setEmail(e.target.value)}
				error={invalid}
				helperText={invalid ? "Enter a valid email address." : undefined}
				disabled={sending}
				fullWidth
			/>
			<Button type="submit" variant="contained" size="large" disabled={sending} className={styles.submit}>
				{sending ? "Sending…" : "Email me a sign-in link"}
			</Button>
		</form>
	);
}
```

  `app/_components/SignInForm.module.scss`:

```scss
@use "../_styles/tokens" as *;

.form {
	display: flex;
	flex-direction: column;
	gap: space(4);
}

.submit {
	min-height: 44px;
}

.sent {
	margin: 0;
	padding: space(4);
	border: 1px solid $color-hairline;
	border-radius: $radius-md;
	background: $color-paper;
}
```

- [ ] **Step 4: Create `app/sign-in/page.tsx`** (a server component)

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import SignInForm, { linkErrorFrom } from "@/app/_components/SignInForm";
import { SITE_NAME } from "@/app/_lib/constants/site";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import styles from "./page.module.scss";

export const metadata: Metadata = { title: `Sign in — ${SITE_NAME}` };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SignInPage({ searchParams }: Props) {
	if (await getCurrentUser()) redirect("/");
	const { error } = await searchParams;
	return (
		<Container component="main" maxWidth="xs" className={styles.page}>
			<Typography variant="displayLg" component="h1">
				Sign in
			</Typography>
			<Typography color="text.secondary">We&apos;ll email you a link. No password needed.</Typography>
			<SignInForm linkError={linkErrorFrom(error)} />
		</Container>
	);
}
```

  `app/sign-in/page.module.scss`:

```scss
@use "../_styles/tokens" as *;

.page {
	display: flex;
	flex-direction: column;
	gap: space(4);
	padding-block: $stack;
}
```

  If Part B hasn't merged yet, `getCurrentUser` won't exist. In that case drop the redirect line and its import, and add both back once Part B lands. Note this in the report.

- [ ] **Step 5:** Run the test again. Expected: PASS (7 tests). Then `pnpm typecheck && pnpm lint`.
- [ ] **Step 6: Commit:** `feat(auth-ui): sign-in page with magic-link form`

### Task 8: Header account menu

**Files:**
- Create: `app/_components/AccountMenu.tsx`, `app/_components/AccountMenu.module.scss`, `app/_components/AccountMenu.test.tsx`
- Modify: `app/_components/SiteHeader.tsx`, `app/_components/SiteHeader.module.scss`, `app/_components/SiteHeader.test.tsx`, `app/layout.tsx`

**Interfaces:**
- Consumes: `CurrentUser`, `authClient.signOut`, `getCurrentUser` (in the layout).
- Produces: `SiteHeader({ user }: { user: CurrentUser | null })`, which stays synchronous, and `AccountMenu({ user }: { user: CurrentUser })`.

- [ ] **Step 1: Replace `app/_components/SiteHeader.test.tsx`**

```tsx
import { screen } from "@testing-library/react";
import SiteHeader from "@/app/_components/SiteHeader";
import { demoHostUser, demoUser, renderWithTheme } from "@/app/_components/testing";

jest.mock("@/app/_lib/authClient", () => ({ authClient: { signOut: jest.fn() } }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));

describe("SiteHeader", () => {
	it("renders a banner landmark with the wordmark linking home, not as a heading", () => {
		renderWithTheme(<SiteHeader user={null} />);
		expect(screen.getByRole("banner")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Iskawt" })).toHaveAttribute("href", "/");
		expect(screen.queryByRole("heading")).not.toBeInTheDocument();
	});

	it("shows a Sign in link when signed out", () => {
		renderWithTheme(<SiteHeader user={null} />);
		expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
	});

	it("shows the account menu button when signed in", () => {
		renderWithTheme(<SiteHeader user={demoUser} />);
		expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: /account/i })).toBeInTheDocument();
	});

	it("shows the Host chip for a linked host", () => {
		renderWithTheme(<SiteHeader user={demoHostUser} />);
		expect(screen.getByText("Host")).toBeInTheDocument();
	});
});
```

  And `app/_components/AccountMenu.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { demoHostUser, demoUser, renderWithTheme } from "@/app/_components/testing";

const mockSignOut = jest.fn();
const mockRefresh = jest.fn();
jest.mock("@/app/_lib/authClient", () => ({ authClient: { signOut: (...a: unknown[]) => mockSignOut(...a) } }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

import AccountMenu from "@/app/_components/AccountMenu";

it("labels the button with the email when the user has no name", () => {
	renderWithTheme(<AccountMenu user={demoUser} />);
	expect(screen.getByRole("button", { name: "Account: demo-user@example.invalid" })).toBeInTheDocument();
});

it("labels the button with the name when present", () => {
	renderWithTheme(<AccountMenu user={demoHostUser} />);
	expect(screen.getByRole("button", { name: "Account: Demo Host A" })).toBeInTheDocument();
});

it("signs out from the menu and refreshes", async () => {
	mockSignOut.mockResolvedValue({ data: {}, error: null });
	renderWithTheme(<AccountMenu user={demoUser} />);
	await userEvent.click(screen.getByRole("button", { name: /account/i }));
	await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
	expect(mockSignOut).toHaveBeenCalled();
	expect(mockRefresh).toHaveBeenCalled();
});

it("is keyboard reachable", async () => {
	renderWithTheme(<AccountMenu user={demoUser} />);
	await userEvent.tab();
	expect(screen.getByRole("button", { name: /account/i })).toHaveFocus();
	await userEvent.keyboard("{Enter}");
	expect(await screen.findByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
});
```

- [ ] **Step 2:** Run both tests. Expected: FAIL, because `AccountMenu` is missing and `SiteHeader` has no `user` prop.

- [ ] **Step 3: Implement `app/_components/AccountMenu.tsx`**

```tsx
"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { authClient } from "@/app/_lib/authClient";
import type { CurrentUser } from "@/app/_lib/types";
import styles from "./AccountMenu.module.scss";

export default function AccountMenu({ user }: { user: CurrentUser }) {
	const router = useRouter();
	const menuId = useId();
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const label = user.name ?? user.email;

	async function signOut() {
		setAnchor(null);
		await authClient.signOut();
		router.refresh();
	}

	return (
		<>
			<Button
				aria-label={`Account: ${label}`}
				aria-haspopup="menu"
				aria-controls={anchor ? menuId : undefined}
				aria-expanded={anchor ? "true" : undefined}
				onClick={(e) => setAnchor(e.currentTarget)}
				className={styles.trigger}
			>
				<span className={styles.label}>{label}</span>
			</Button>
			<Menu id={menuId} anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
				<MenuItem onClick={signOut} className={styles.item}>
					Sign out
				</MenuItem>
			</Menu>
		</>
	);
}
```

  `app/_components/AccountMenu.module.scss`:

```scss
@use "../_styles/tokens" as *;

.trigger {
	min-height: 44px;
	text-transform: none;
}

.label {
	max-width: 24ch;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.item {
	min-height: 44px;
}
```

- [ ] **Step 4: Replace `app/_components/SiteHeader.tsx`**

```tsx
import Link from "next/link";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import AccountMenu from "@/app/_components/AccountMenu";
import type { CurrentUser } from "@/app/_lib/types";
import styles from "./SiteHeader.module.scss";

// Stays a synchronous server component. The layout reads the user and passes it in.
export default function SiteHeader({ user }: { user: CurrentUser | null }) {
	return (
		<header className={styles.header}>
			<Link href="/" className={styles.link}>
				<Typography component="span" variant="displaySm">
					Iskawt
				</Typography>
			</Link>
			<div className={styles.account}>
				{user ? (
					<>
						{user.host && <Chip label="Host" size="small" color="primary" variant="outlined" />}
						<AccountMenu user={user} />
					</>
				) : (
					<Link href="/sign-in" className={styles.link}>
						Sign in
					</Link>
				)}
			</div>
		</header>
	);
}
```

  Add to `app/_components/SiteHeader.module.scss`:

```scss
.account {
	display: flex;
	align-items: center;
	gap: space(2);
	margin-inline-start: auto;
}
```

- [ ] **Step 5: In `app/layout.tsx`,** make `RootLayout` `async` and add `const user = await getCurrentUser();` (imported from `@/app/_lib/server/currentUser`). Render `<SiteHeader user={user} />`. If Part B hasn't merged yet, pass `user={null}` and leave a note in the report, not a TODO in code.

- [ ] **Step 6:** Run both tests. Expected: PASS. Then `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- [ ] **Step 7: Commit:** `feat(auth-ui): header account menu and sign-in link`
- [ ] **Step 8: Checkpoint.** Send the Part C diff to a fresh `reviewer` agent.

---

## After both parts

- [ ] **Update `PLAN.md`.** Split slice 5 into **5a — Accounts** and **5b — Inquiries and threads**. Remove "messaging threads" and "host accounts and auth" from "Deliberately not in v1", with a note that they're in scope as of 2026-10-05. Commit: `docs: plan — slice 5 split into accounts and threads`.
- [ ] **Run the whole definition of done on the branch:** `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Then check by reading code, not rendered output: grep every `Host` read for `include`, and confirm no `console.*` prints an email, a token or a session.
- [ ] **Human:** add `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL`, `RESEND_API_KEY` and `EMAIL_FROM` to `.env`, and verify the sending domain in Resend.
