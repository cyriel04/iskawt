# FAQ — questions section on the home page

Status: approved in the main session, 2026-11-05.

## Why

Hosts and renters ask the same things: how an inquiry works, why the address is
hidden, whether rates are final, who sees a host's contact details. One section
answers them in one place, worded to match how the product actually behaves.

## What gets built

- A **"Questions"** section at the bottom of the browse page (`app/(browse)/page.tsx`),
  below `BrowseView` (results and pagination). It renders on every browse URL,
  filtered or not, and in the empty-results state too.
- The section has `id="faq"`. The **footer** gets a "FAQ" link to `/#faq`, so it
  works from any page. Not in the header (decided: the header is already full).
- Two groups, **"For renters"** and **"For hosts"**, each a list of MUI
  `Accordion`s, all collapsed on load. The two "for both" questions appear in
  both groups, so each group stands alone.
- Copy lives in `app/_lib/constants/faq.ts` (new file in shared constants — an
  addition, not a change): plain data, `{ question, answer }` per item, grouped.
  The component renders whatever is there; editing copy never touches it.

## Copy (approved)

### For renters

1. **How do I book a space?** — You don't book on Iskawt. Sign in, open a listing
   and send an inquiry with your dates, hours, crew size and what you're shooting.
   The host replies in your Iskawt inbox, and we email you when they do. You
   agree on everything else directly with the host.
2. **Why can't I see the exact address?** — Listings show only the area and city,
   because these are people's homes and businesses. The host shares the address
   with you in the conversation if they decide to go ahead.
3. **Are the rates final?** — No. Rates are indicative and set by each host, and
   you agree the actual price with them. Iskawt takes no payment.
4. **What does "Demo" on a listing mean?** — It's sample data used while Iskawt is
   new. It isn't a real space you can rent.
5. **Which areas do you cover?** — Metro Manila only: its 16 cities and Pateros.
6. **Do I need a permit?** — Iskawt doesn't handle permits. Ask your host what the
   building or community needs.
7. *(both)* How do I sign in?
8. *(both)* What if someone makes me uncomfortable?

### For hosts

1. **How do I list my space?** — Sign in, go to List your space and send an
   application. A person reviews every space before it goes live, and we email
   you to talk it through.
2. **Who sees my email and phone number?** — Only the Iskawt team. Renters talk to
   you through your Iskawt inbox.
3. **Who sees my address?** — Only the Iskawt team. Your listing shows the area and
   city, and you decide whether to share the address with a renter.
4. **Does it cost anything to list?** — Free to list. No payment goes through
   Iskawt.
5. **Do I have to accept every inquiry?** — No. You can decline or close any
   conversation.
6. *(both)* How do I sign in?
7. *(both)* What if someone makes me uncomfortable?

### For both (shared items, defined once in `faq.ts`)

- **How do I sign in?** — Enter your email and we send you a sign-in link. It
  works once and expires in 15 minutes. There's no password.
  (Build the "15" from `MAGIC_LINK_TTL_MINUTES` in `limits.ts`, not a literal.)
- **What if someone makes me uncomfortable?** — Use the menu in the conversation
  to report it, which a person reviews, or to block them. A blocked person can't
  message you or send you new inquiries, and isn't told they were blocked.

### Closing line (added 2026-11-05)

After both groups: "Still have questions?" then "Email us at <CONTACT_EMAIL>",
the address a `mailto:` link. `CONTACT_EMAIL` is a new export in
`app/_lib/constants/site.ts`, currently `placeholder@example.com` — a placeholder the
human replaces before launch.

The permit answer gives no advice about LGU or barangay rules, deliberately —
permits are out of scope (CLAUDE.md).

## Structure and accessibility

- `<section id="faq" aria-labelledby=…>` with an `h2` "Questions"; each group an
  `h3`; each question is the accordion summary's heading (`h4` — set via
  `slotProps.heading` on `Accordion`; check MUI 9's API in `node_modules`).
- Keyboard: the summary is a button; Enter/Space toggles. Touch target ≥ 44px.
- Server component. MUI `Accordion` is a client component internally; rendering
  it with plain string children from a server component is fine. No `"use client"`
  in the new component unless the build demands it.
- `/#faq` must land on the section after the page streams in; check by hand in
  `pnpm dev`.

## Constraints

- SCSS module only, tokens via `_tokens.scss`. No `sx`, `styled`, inline styles.
- No new dependency. No change to `types.ts`, the schema, or any API.
- Owner: frontend-dev (component, page, footer, styles). `faq.ts` is shared
  constants, an addition.

## Left to the builder

Spacing, dividers between groups, and whether the accordions use MUI's default
outlined/elevation look or a flat one — pick what sits well with the browse page
and the theme's existing `components` overrides.

## Out of scope

Per-question deep links, a separate `/faq` route, search within the FAQ,
structured data (`FAQPage` JSON-LD) — all possible later.
