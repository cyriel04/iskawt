# Slice 6-1 — Names and Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A renter's typed name can't pass for Iskawt, and notification emails carry no user-typed text.

**Architecture:**
- **Name filter:** a pure check in `app/_lib/inquiryValidation.ts`, so the form and `POST /api/inquiries` share it. Reserved words live in a new constants file.
- **Email:** `inquiryMessageEmail` loses its `senderName` and `body` arguments. `notifyCounterpart` loses its `body` parameter and stops selecting the names it no longer needs. Its two callers stop passing the body.

**Tech Stack:** TypeScript strict, Jest 30 (node environment for server tests).

**Spec:** `docs/superpowers/specs/2026-10-18-slice-6-safety-design.md`, section **Names and emails**. The spec's line "`notifyCounterpart` sends nothing when the thread can't take messages" needs `Block`, so it belongs to **6-2**, not here.

## Global Constraints

- **Ownership:** both tasks go to `backend-dev`. `app/_lib/types.ts` doesn't change, and neither does `prisma/**`. `app/_lib/constants/reservedNames.ts` is a new file, which is an allowed addition.
- **Size:** 10 files, 4 of them tests. Accepted for this PR: Task 2's call-site changes are one line each.
- **Commits:** commit locally on `feat/slice-6-safety` at each commit step, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push or rebase.
- **Off limits:** new dependencies, lockfiles, `.env*`.
- **Privacy:** no log line may contain a message body, a name or an email address. The email names nobody.
- **Copy, verbatim:**
  - name error: `Use your own name or your production's name.`
  - email first line: `You have a new message about {space title}.`
  - safety line: `Iskawt never asks for passwords or payment, by email or in messages.`
- **TypeScript strict.** No `any`, no `@ts-ignore`, no non-null `!`.
- **Tests come first.** Watch each new test fail before implementing.
- **Commands:** one file with `pnpm exec jest "<path regex>"`. Then `pnpm typecheck` and `pnpm lint`.

## Review Focus

1. **Real names that would be wrongly rejected.** "Steam Films", "Teamwork Studio", "Ma. Teresa", "J.R. Santos", "Ella Cruz" (the `l` → `i` mapping), and names with accents like "José Rizal" must pass. Test: Task 1.
2. **Impersonation that slips past the filter.** "ISKAWT", "Ískawt", "1skawt", "i-s-k-a-w-t", "IskawtPH", "Iskawt​Support" (zero-width space between the words), "Team Iskawt", "Support". Test: Task 1.
3. **Contact details in a name.** "a@b.co", "visit www.example.com", "example.com", "https://x.io". Test: Task 1.
4. **Leftover typed text anywhere in the email.** The sender's name and the body must be absent from subject, text and HTML, including in the not-yet-linked host's variant. Test: Task 2.
5. **Data that's no longer used still being read.** `notifyCounterpart` must stop selecting `requesterName` and `host.displayName`. Test: Task 2 asserts the `select`.

---

### Task 1: Reserved-name filter

**Files:**
- Create: `app/_lib/constants/reservedNames.ts`
- Modify: `app/_lib/inquiryValidation.ts` (the `requesterName` block in `validateNewInquiry`, plus the new helper above it)
- Test: `app/_lib/inquiryValidation.test.ts`

**Interfaces:**
- Produces: `RESERVED_BRAND_WORDS`, `RESERVED_ROLE_WORDS` (readonly string tuples), and `validateNewInquiry` returning `errors.requesterName = "Use your own name or your production's name."` for an impersonating name. No new exported function: the check is private to the validator.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("validateNewInquiry", …)` in `app/_lib/inquiryValidation.test.ts`:

```ts
	const OFFICIAL = "Use your own name or your production's name.";

	it.each([
		"Iskawt",
		"ISKAWT",
		"Ískawt",
		"1skawt",
		"i-s-k-a-w-t",
		"IskawtPH",
		"Iskawt​Support",
		"Team Iskawt",
		"Iskawt Support",
		"Support",
		"Admin",
		"Scout Films",
		"0fficial Staff",
		"Mod: moderator",
		"a@b.co",
		"visit www.example.com",
		"example.com",
		"https://x.io",
	])("rejects a name that could pass for Iskawt or carries contact details (%s)", (requesterName) => {
		expect(validateNewInquiry({ ...valid, requesterName }, today)).toEqual({
			ok: false,
			errors: { requesterName: OFFICIAL },
		});
	});

	it.each([
		"Ana Reyes",
		"Reyes Films",
		"Ma. Teresa",
		"J.R. Santos",
		"Studio Uno",
		"Steam Films",
		"Teamwork Studio",
		"Ella Cruz",
		"José Rizal",
		"Demo Renter",
	])("accepts an ordinary name (%s)", (requesterName) => {
		expect(validateNewInquiry({ ...valid, requesterName }, today).ok).toBe(true);
	});
```

- [ ] **Step 2: Run them and watch the reject cases fail**

Run: `pnpm exec jest "app/_lib/inquiryValidation.test.ts"`
Expected: every "rejects a name…" case FAILS (`ok: true` received). The "accepts" cases pass already.

- [ ] **Step 3: Add the constants**

Create `app/_lib/constants/reservedNames.ts`:

```ts
// Words a renter's typed name may not contain, so the name can't pass for
// Iskawt in a thread. Compared after the validator's normalising (lowercase,
// accents stripped, lookalikes mapped): see app/_lib/inquiryValidation.ts.

// Matched anywhere in the name, across word breaks: "i-s-k-a-w-t", "IskawtPH".
export const RESERVED_BRAND_WORDS = ["iskawt", "scout"] as const;

// Matched only as a whole word: "Team Iskawt" is caught, "Steam Films" is not.
export const RESERVED_ROLE_WORDS = ["support", "admin", "staff", "team", "official", "moderator"] as const;
```

- [ ] **Step 4: Implement the check**

In `app/_lib/inquiryValidation.ts`, add to the imports:

```ts
import { RESERVED_BRAND_WORDS, RESERVED_ROLE_WORDS } from "@/app/_lib/constants/reservedNames";
```

Add below `const hasNul = …`:

```ts
// A typed name that could pass for Iskawt, or that carries a URL or an email
// address. Lookalikes are mapped before splitting into words, and the reserved
// words go through the same mapping, so "official" still matches itself.
const OFFICIAL_NAME = "Use your own name or your production's name.";
const LOOKALIKES: Readonly<Record<string, string>> = { "1": "i", l: "i", "!": "i", "0": "o", "@": "a", $: "s", "3": "e" };

function nameWords(value: string): string[] {
	const folded = value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
	const mapped = [...folded].map((c) => LOOKALIKES[c] ?? c).join("");
	return mapped.split(/[^\p{L}]+/u).filter(Boolean);
}

const BRAND_WORDS = RESERVED_BRAND_WORDS.map((word) => nameWords(word).join(""));
const ROLE_WORDS = new Set(RESERVED_ROLE_WORDS.flatMap(nameWords));
const CONTACT_LIKE = /@|https?:\/\/|www\.|[\p{L}\d]\.\p{L}{2,}/iu;

function looksOfficial(name: string): boolean {
	if (CONTACT_LIKE.test(name)) return true;
	const words = nameWords(name);
	const joined = words.join("");
	return BRAND_WORDS.some((word) => joined.includes(word)) || words.some((word) => ROLE_WORDS.has(word));
}
```

In `validateNewInquiry`, extend the `requesterName` chain:

```ts
	const requesterName = text(raw.requesterName);
	if (!requesterName) errors.requesterName = "Enter your name.";
	else if (hasNul(requesterName)) errors.requesterName = UNSUPPORTED;
	else if (chars(requesterName) > INQUIRY_NAME_MAX) errors.requesterName = tooLong(INQUIRY_NAME_MAX);
	else if (looksOfficial(requesterName)) errors.requesterName = OFFICIAL_NAME;
```

Note on the zero-width space case: `​` is not a letter (`\p{L}`), so it splits words. "Iskawt​Support" then yields `["iskawt", "support"]` and is caught by both rules.

Note on "J.R. Santos": `CONTACT_LIKE` needs two or more letters after a dot with no space. "J.R." has one letter after each dot, so it passes. "Ma. Teresa" has a space after the dot.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm exec jest "app/_lib/inquiryValidation.test.ts"`
Expected: PASS, every case, including the existing ones.

- [ ] **Step 6: Check the form still passes**

Run: `pnpm exec jest "InquiryForm|InquiryPanel"` and `pnpm typecheck`
Expected: PASS. If a form test fixture uses a name the filter now rejects, stop and report it rather than changing the filter.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/constants/reservedNames.ts app/_lib/inquiryValidation.ts app/_lib/inquiryValidation.test.ts
git commit -m "feat(inquiries): reject requester names that could pass for Iskawt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Notification emails without typed text

**Files:**
- Modify: `app/_lib/server/inquiryEmail.ts` (whole file)
- Modify: `app/_lib/server/inquiryNotify.ts:47-82` (signature, `select`, the `inquiryMessageEmail` call)
- Modify: `app/api/inquiries/route.ts:28,31`
- Modify: `app/api/inquiries/[id]/messages/route.ts:35`
- Test: `app/_lib/server/inquiryEmail.test.ts`, `app/_lib/server/inquiryNotify.test.ts`, `app/api/inquiries/routes.test.ts:188,209`

**Interfaces:**
- Produces:
  - `inquiryMessageEmail(args: { to: string; spaceTitle: string; url: string; hostNotLinked: boolean }): MailMessage`
  - `notifyCounterpart(inquiryId: string, senderRole: InquiryRole, now?: Date): Promise<void>`. 6-2 adds its read-only check inside this function.

- [ ] **Step 1: Rewrite the email tests**

Replace `app/_lib/server/inquiryEmail.test.ts` with:

```ts
/** @jest-environment node */
import { inquiryMessageEmail } from "@/app/_lib/server/inquiryEmail";

const base = {
	to: "demo-host@example.invalid",
	spaceTitle: "[DEMO] Corner loft",
	url: "http://localhost:3000/inbox/inq_1",
	hostNotLinked: false,
};

it("addresses the recipient and names the space in the subject", () => {
	const msg = inquiryMessageEmail(base);
	expect(msg.to).toBe("demo-host@example.invalid");
	expect(msg.subject).toBe("New message about [DEMO] Corner loft");
});

it("says there is a message and links to it, with the safety line and no-reply footer", () => {
	const msg = inquiryMessageEmail(base);
	expect(msg.text).toContain("You have a new message about [DEMO] Corner loft.");
	expect(msg.text).toContain("Reply on Iskawt: http://localhost:3000/inbox/inq_1");
	expect(msg.text).toContain("Iskawt never asks for passwords or payment, by email or in messages.");
	expect(msg.text).toContain("Replies to this email aren't delivered.");
	expect(msg.html).toContain('href="http://localhost:3000/inbox/inq_1"');
	expect(msg.html).toContain("Iskawt never asks for passwords or payment, by email or in messages.");
});

it("tells an unlinked host to sign in with this address", () => {
	const msg = inquiryMessageEmail({ ...base, hostNotLinked: true, url: "http://localhost:3000/sign-in?next=%2Finbox%2Finq_1" });
	expect(msg.text).toContain("Sign in with this email address to read and reply: http://localhost:3000/sign-in?next=%2Finbox%2Finq_1");
});

it("takes no sender name or message body, so neither can reach the email", () => {
	// The args type has no such fields; extra properties prove they are ignored.
	const withExtras: Parameters<typeof inquiryMessageEmail>[0] & Record<string, unknown> = {
		...base,
		senderName: "Iskawt Support",
		body: "Your listing is suspended. Verify at https://evil.example",
	};
	for (const variant of [withExtras, { ...withExtras, hostNotLinked: true }]) {
		const msg = inquiryMessageEmail(variant);
		const all = `${msg.subject}\n${msg.text}\n${msg.html}`;
		expect(all).not.toContain("Iskawt Support");
		expect(all).not.toContain("suspended");
		expect(all).not.toContain("evil.example");
		expect(all).not.toContain("wrote about");
	}
});

it("escapes HTML in the space title and strips CR/LF from the subject", () => {
	const msg = inquiryMessageEmail({ ...base, spaceTitle: 'Loft <b>"A"</b>\r\nBcc: x@example.invalid' });
	expect(msg.subject).toBe('New message about Loft <b>"A"</b> Bcc: x@example.invalid');
	expect(msg.subject).not.toMatch(/[\r\n]/);
	expect(msg.html).not.toContain("<b>");
	expect(msg.html).toContain("Loft &lt;b&gt;&quot;A&quot;&lt;/b&gt;");
});
```

- [ ] **Step 2: Update the notify tests**

In `app/_lib/server/inquiryNotify.test.ts`:

1. Remove `requesterName` from `row()`, and `displayName` from its `host`.
2. Replace every call `notifyCounterpart("<id>", "<ROLE>", "<text>", now)` with `notifyCounterpart("<id>", "<ROLE>", now)`. Do the same for the unknown-inquiry call (`"nope", "RENTER", now`).
3. In the first test, replace `text: expect.stringContaining("Demo Renter wrote about")` with `text: expect.stringContaining("You have a new message about [DEMO] Corner loft.")`.
4. Rename the third test to `"emails the renter when the host writes"` and replace its last assertion with:

```ts
	expect(mockSend.mock.calls[0][0]).toMatchObject({
		to: "demo-renter@example.invalid",
		text: expect.stringContaining("You have a new message about [DEMO] Corner loft."),
	});
```

5. In both log-privacy tests, drop `secret message|` from the `not.toMatch` patterns. There is no body to leak now; the address checks stay.
6. Add:

```ts
it("reads only what the email needs: no names, no message", async () => {
	await notifyCounterpart("inq_1", "RENTER", now);
	expect(mockFindUnique).toHaveBeenCalledWith({
		where: { id: "inq_1" },
		select: {
			id: true,
			renter: { select: { email: true } },
			space: { select: { title: true, host: { select: { contactEmail: true, user: { select: { email: true } } } } } },
		},
	});
});
```

- [ ] **Step 3: Update the route test expectations**

In `app/api/inquiries/routes.test.ts`:
- line 188: `expect(mockNotify).toHaveBeenCalledWith(outcome.id, "RENTER");`
- line 209: `expect(mockNotify).toHaveBeenCalledWith("inq_1", "HOST");`

- [ ] **Step 4: Run them and watch them fail**

Run: `pnpm exec jest "inquiryEmail|inquiryNotify|api/inquiries/routes"`
Expected: FAIL. The email still says "wrote about", the select still has names, and the routes still pass a third argument.

- [ ] **Step 5: Rewrite the email**

Replace `app/_lib/server/inquiryEmail.ts` with:

```ts
// The "new message" notification. The space title (reviewed by a human) and a
// link only. Nothing a user typed, not their name and not their message, so an
// email from the Iskawt domain can't carry someone posing as Iskawt.

import { SITE_NAME } from "@/app/_lib/constants/site";
import { escapeHtml } from "@/app/_lib/server/escapeHtml";
import type { MailMessage } from "@/app/_lib/server/mailer";

type Args = {
	to: string;
	spaceTitle: string;
	url: string;
	hostNotLinked: boolean;
};

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ");

export function inquiryMessageEmail({ to, spaceTitle, url, hostNotLinked }: Args): MailMessage {
	const intro = `You have a new message about ${spaceTitle}.`;
	const cta = hostNotLinked ? "Sign in with this email address to read and reply" : `Reply on ${SITE_NAME}`;
	const safety = `${SITE_NAME} never asks for passwords or payment, by email or in messages.`;
	const footer = `Replies to this email aren't delivered. Reply on ${SITE_NAME} instead.`;
	return {
		to,
		subject: `New message about ${oneLine(spaceTitle)}`,
		text: `${intro}\n\n${cta}: ${url}\n\n${safety}\n\n${footer}`,
		html:
			`<p>${escapeHtml(intro)}</p>` +
			`<p><a href="${escapeHtml(url)}">${escapeHtml(cta)}</a></p>` +
			`<p>${escapeHtml(safety)}</p>` +
			`<p>${escapeHtml(footer)}</p>`,
	};
}
```

- [ ] **Step 6: Update `notifyCounterpart`**

In `app/_lib/server/inquiryNotify.ts`:

```ts
export async function notifyCounterpart(
	inquiryId: string,
	senderRole: InquiryRole,
	now: Date = new Date(),
): Promise<void> {
	const toHost = senderRole === "RENTER";
	try {
		const row = await prisma.inquiry.findUnique({
			where: { id: inquiryId },
			select: {
				id: true,
				renter: { select: { email: true } },
				space: { select: { title: true, host: { select: { contactEmail: true, user: { select: { email: true } } } } } },
			},
		});
		if (!row) return;
		if (!(await claim(inquiryId, toHost, now))) return;

		const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
		const threadPath = `/inbox/${inquiryId}`;
		const host = row.space.host;
		const hostNotLinked = toHost && host.user === null;
		const message = inquiryMessageEmail({
			to: toHost ? (host.user?.email ?? host.contactEmail) : row.renter.email,
			spaceTitle: row.space.title,
			url: hostNotLinked ? `${base}/sign-in?next=${encodeURIComponent(threadPath)}` : `${base}${threadPath}`,
			hostNotLinked,
		});
```

The rest of the function (the send, `release`, `sendFailed`, the outer catch) is unchanged. Update the file's top comment to: `Emails the other side of a thread after a message is saved, without the message itself.` and keep the rest of that comment.

- [ ] **Step 7: Update the callers**

`app/api/inquiries/route.ts`, both cases:

```ts
			after(() => notifyCounterpart(outcome.id, "RENTER"));
```

`app/api/inquiries/[id]/messages/route.ts`:

```ts
			after(() => notifyCounterpart(id, outcome.role));
```

- [ ] **Step 8: Run the tests and watch them pass**

Run: `pnpm exec jest "inquiryEmail|inquiryNotify|api/inquiries/routes"`
Expected: PASS.

- [ ] **Step 9: Full checks**

Run: `pnpm test`, `pnpm typecheck` and `pnpm lint`
Expected: all clean. Also run `grep -rn "senderName\|wrote about" app/_lib/server app/api`. Expected: no hits outside `inquiryAccess.ts` and its test. Those use `senderName` for in-app `InquiryMessage` and stay as they are.

- [ ] **Step 10: Commit**

```bash
git add app/_lib/server/inquiryEmail.ts app/_lib/server/inquiryEmail.test.ts app/_lib/server/inquiryNotify.ts app/_lib/server/inquiryNotify.test.ts app/api/inquiries/route.ts "app/api/inquiries/[id]/messages/route.ts" app/api/inquiries/routes.test.ts
git commit -m "feat(inquiries): notification emails carry no user-typed text

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
