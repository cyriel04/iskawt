# Iskawt — build plan

Vertical slices. Each one ends with something that works end to end, is committed,
and is reviewed. No slice starts before the previous one is merged.

**Do not parallelize until slice 3 is merged.** A repo with no established patterns
just gets you two agents inventing two different ones.

---

## The thing that will actually decide this project

You cannot seed this product by yourself. A permit directory could launch with
twenty rows you researched in an afternoon. A listing directory needs twenty
property owners to say yes, and you cannot invent a listing for a space you do not
own — not the rate, not the photos, not the host.

So there are two tracks, and only one of them is code:

- **Code track:** slices 0 through 6 below.
- **Host track:** find real spaces. Start with people you know — friends with
  photogenic apartments, a café owner, a co-working space, a studio that rents by
  the hour anyway. Ten real listings is a product. Two is a demo.

Run the host track in parallel starting today, because it has a lead time the code
does not. If it stalls, the fallback is clearly-labelled demo listings with a README
line saying so — honest for a portfolio piece, useless as a product.

---

## Slice 0 — Scaffold (you, by hand, no agents)

See `SETUP.md`. Twelve steps, ends with `pnpm dev` serving a page, `pnpm test`
passing, and Claude Code reading `CLAUDE.md` back to you correctly.

---

## Slice 1 — Host outreach (you, no code)

- Write the one-paragraph pitch: what Iskawt is, what it costs the host (nothing),
  what they get (inquiries), what it asks of them (photos and a rate).
- Talk to ten people. Aim for five yeses.
- For each yes, collect: photos, rate, area, space type, the practical fields
  (natural light, power, parking, load-in, house rules), and written permission to
  list them.

**Done when:** five real spaces are written down somewhere, with permission.

---

## Slice 2 — Seed data (you, by hand)

Turn slice 1 into `prisma/seed.ts`. Real hosts, real spaces, real rates.

If slice 1 hasn't landed yet, seed clearly-labelled demo listings instead — host
`displayName` of "Demo Host", a `DEMO` marker in the title — and put a line in the
README. Never blur the line between demo and real.

**Done when:** `pnpm db:seed` loads and every field is one you can defend.

---

## Slice 3 — Browse and listing detail (single agent, no split)

- `/` — published spaces, server component, card per space
- `/spaces/[slug]` — detail with photos, practical specs, indicative rates
- Empty and error states
- Cypress spec: land on browse, click through, see detail

This slice sets the patterns everything else copies — how `app/_lib/server/` queries are
shaped, how a card looks, how tests are written. Review it for conventions, not
just correctness.

**Critical in review:** the public query must `select` explicit fields. If the
agent wrote `include: { host: true }`, host emails and phone numbers are now on the
page. Check this by reading the query, not by looking at the rendered output.

---

## Slice 4 — Filters and search (first split)

- **backend-dev:** query layer — filter by city, space type, setting, crew size,
  rate range; text search on title, description and tags; pagination. Tests per
  filter and for combinations.
- **frontend-dev:** filter panel, active-filter chips, results count, empty state.
  All state in URL search params.
  Also link the city in the detail page's breadcrumb (`Spaces › <city> › <title>`,
  plain text since slice 3) to the browse view filtered by that city.

Settle the filter params in `app/_lib/types.ts` first, in the main session, before
either agent starts.

**Done when:** a filtered URL pasted into a new tab reproduces the view.

---

## Slice 5a — Accounts

Scope changed 2026-10-05: inquiries become real in-app threads between host and
renter, with accounts for both. Accounts come first.

- Magic-link sign-in (Better Auth), Resend over `fetch` for email.
- A user whose email matches a verified `Host.contactEmail` is linked to that host
  automatically; ambiguous matches are left for a human.
- `/sign-in`, header account menu. Browsing never requires signing in.
- Spec: `docs/superpowers/specs/2026-10-05-slice-5a-accounts-design.md`.

## Slice 5b — Inquiries and threads

The product's whole reason to exist. Nothing else matters if this is unreliable.

- A signed-in renter sends an inquiry from the detail page; host and renter message
  each other in the app; email notifies of new messages.
- Neither side sees the other's email or phone unless they type it into a message
  themselves. The host releases the exact address in a message, by choice.
- Open question: sign in before writing the inquiry, or write first and confirm by
  the emailed link. Decide in the 5b spec.
- **You:** watch the first ten inquiries by hand. Reply if the host doesn't.

---

## Slice 6 — Host applications and ship

- **backend-dev:** `POST /api/host-applications` → `HostApplication` in `PENDING`.
  Never creates a `Host` or `Space` directly.
- **frontend-dev:** "List your space" page and form.
- **You:** review applications in Prisma Studio and create rows by hand. No admin
  UI in v1 — building one is how side projects die.
- Deploy: Vercel + Neon Postgres.
- README with screenshots, the product rationale, the privacy model, and what's
  next. This is the part a hiring reader actually reads.

---

## Deliberately not in v1

Cut these if they creep in:

- Payments, deposits, invoices, cancellation policies
- Availability calendars — `availabilityNotes` is free text on purpose
- Reviews, ratings, favourites
- (Messaging threads and host/renter accounts moved into v1 on 2026-10-05 —
  slices 5a and 5b. A human still creates `Host` rows.)
- Maps — `areaName` and city carry the location; a map needs jittered coordinates
  and a real privacy review first
- Admin dashboard — Prisma Studio

---

## The loop, every slice

1. Settle the contract with the main session (`/brainstorm` if it's fuzzy)
2. `/write-plan` → read it yourself → `/execute-plan`
3. Agent implements test-first
4. Fresh `reviewer` subagent on the diff, no implementation context
5. You read the diff. Actually read it.
6. Commit and merge

Step 5 is the one that gets skipped and the one that matters. If you cannot explain
a file in the diff, that file does not merge.
