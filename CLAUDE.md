# Iskawt — private shoot spaces in Metro Manila

"Iskawt" is the Filipino respelling of "scout" — as in location scouting. Always
spelled this way in UI copy, metadata, and commits. Never "Iskwat" or "Scout".

A listing directory of private spaces across Metro Manila available for film and
photo shoots: apartments, studios, rooftops, cafés, warehouses. Hosts list a space;
renters send an inquiry; the two arrange the rest between themselves.

**Inquiry only.** No payments, no calendar, no bookings, no reviews in v1. If a
feature needs a payment rail or an availability model, it is out of scope.

Public locations, streets, and government permits are **out of scope**. An earlier
version of this product was a permit directory; it isn't one any more. If a task
mentions permits, LGU rules, or barangay clearances, stop and ask.

## Stack

- Next.js 16 (16.3.x), App Router, Turbopack, TypeScript strict
- MUI + Emotion for components; **SCSS modules for styling**; theme tokens only
- Prisma 7 + PostgreSQL (Neon in production, Docker locally)
- Server components for reads, route handlers for writes. **No GraphQL, no Apollo.**
- Jest + React Testing Library. Cypress for e2e — **deferred to v2, not installed yet**

## Layout

Everything application-side lives under `app/`. Folders prefixed with `_` are
Next.js **private folders** — excluded from routing, so they can sit inside `app/`
without becoming URLs.

```
app/
  page.tsx, layout.tsx      routes and layouts
  spaces/[slug]/page.tsx    listing detail
  api/                      route handlers — the only write paths
  _components/              presentational + client components, each with
                            its colocated Name.module.scss
  _styles/
    _tokens.scss            SCSS names for theme tokens (CSS variable refs only)
    *.module.scss           styles shared by several routes
  _lib/
    types.ts                shared types — THE CONTRACT
    constants/              plain shared values, no logic: labels.ts (enum
                            display names, singular + plural), limits.ts
                            (URL caps, page size), site.ts (site-wide copy)
    db.ts                   the one PrismaClient, with its driver adapter
    server/                 queries, business logic
    theme.ts                design tokens → MUI theme + CSS variables.
                            The only place token values are written.
prisma/                     schema.prisma, migrations, seed.ts
prisma.config.ts            repo root — connection URL for the Prisma CLI
docs/mockups/               static HTML mockups. Visual reference only.
cypress/                    e2e specs
```

Import alias: `@/*` resolves from the repo root, so `app/_lib/db.ts` imports as
`@/app/_lib/db`.

If your scaffold uses a `src/` directory, every `app/` path above is `src/app/`.

## Toolchain gotchas

These bite on every fresh clone and every new machine. Do not work around them.

- **Next.js 16 removed `next lint`.** Lint with `eslint .` and a flat
  `eslint.config.mjs`. `next build` no longer runs a lint pass, so lint is part of
  the definition of done rather than something the build enforces.
- **The `eslint` key in `next.config.ts` is ignored**, including
  `ignoreDuringBuilds`. Do not add it.
- **Next.js 16 error boundaries receive `retry`, not `reset`.** Check
  `node_modules/next/dist/docs/` before trusting an example from memory.
- **A `loading.tsx` above a route that calls `notFound()` turns its 404 into a 200**,
  because the page shell streams first. Scope loading states with a route group
  (`app/(browse)/loading.tsx`); never put one at `app/loading.tsx`.
- **`@mui/material-nextjs` has a per-version entry.** Import from
  `@mui/material-nextjs/v16-appRouter`.
- **MUI styles must sit in a CSS layer.** `AppRouterCacheProvider` takes
  `options={{ enableCssLayer: true }}`. Without it, MUI's styles load after the
  SCSS modules and win every tie, so a `className` on an MUI component silently
  loses (e.g. `position: fixed` on a `Fab`). Never remove that option.
- **pnpm blocks dependency build scripts.** Approvals live in `pnpm-workspace.yaml`
  at the repo root, never in a `"pnpm"` block in `package.json` — current pnpm does
  not read that field. Use `pnpm approve-builds`; never
  `dangerouslyAllowAllBuilds`.

## Prisma 7 — not v6

Most Prisma examples in circulation are v6 and will not work here.

- The connection URL lives in `prisma.config.ts` at the repo root. **Never** a `url`
  property in `schema.prisma` — that is error P1012.
- `PrismaClient` is constructed with a driver adapter (`@prisma/adapter-pg`), in
  `app/_lib/db.ts` and nowhere else.
- The client is generated into the repo at the generator's `output` path. Import
  from there, never from `@prisma/client`.
- `/generated` is gitignored and never edited.

## Visual reference

`docs/mockups/` holds static HTML mockups of the browse and listing pages. They
settle layout and hierarchy — nothing more. **Never copy their inline styles.**
They hardcode hex values because they are standalone files; the app reads
`app/_lib/theme.ts`.

## Commands

```bash
pnpm dev
pnpm test                  # Jest
pnpm test -- --watch
pnpm e2e                   # Cypress
pnpm typecheck
pnpm lint
pnpm db:push
pnpm db:migrate
pnpm db:seed
pnpm db:studio
```

## Ownership map

| Area | Owner | Off limits to |
| --- | --- | --- |
| `page.tsx` / `layout.tsx` / `loading.tsx` / `error.tsx` / `not-found.tsx` anywhere in `app/`, `app/_components/**`, `app/_styles/**`, any `*.module.scss`, `app/_lib/theme.ts` | frontend-dev | backend-dev |
| `app/api/**`, `app/_lib/server/**`, `app/_lib/db.ts`, `prisma/**` | backend-dev | frontend-dev |
| `app/_lib/types.ts` | **nobody without approval** | both |
| `app/_lib/constants/**` | shared — either may add; changing an existing value needs approval (search matches labels, the parser enforces limits) | — |
| `prisma/migrations/**`, `generated/**` | generated only | both |

Everything is under `app/` now, so the split is **by file kind, not by top-level
folder**. Routes and layouts are frontend; anything under `api/` or `_lib/server/`
is backend. When in doubt: does it run only on the server and touch the database?
That is backend-dev's, wherever it sits.

## The contract

`app/_lib/types.ts` and `prisma/schema.prisma` are settled in the main session with the
human before implementation starts. Once agreed:

- backend-dev implements queries and handlers against them.
- frontend-dev builds against the types with fixtures, and does not wait for the
  data layer to exist.
- If either agent thinks the shape is wrong, it **stops and reports**. It does not
  edit the contract, does not cast to `any`, and does not reshape data in the
  component to paper over a gap.

## Privacy rules — the ones that matter most

A listing is about someone's home or business. Get these wrong and the product is
worse than useless.

- **`Host.contactEmail` and `Host.contactPhone` are never public.** They must not
  appear in any type that reaches a component, any API response, any page prop, or
  any log line. Every read of `Host` from a public path selects fields explicitly.
  `include: { host: true }` on a public query is a bug.
- **`Space.exactAddress` is never public.** A listing shows `areaName` and `city`.
  The host releases the address privately after accepting an inquiry.
- **Public coordinates are jittered.** `latitude` and `longitude` are stored
  approximate, roughly 300m off, so a map can never resolve to a doorstep. Never
  store the true coordinates in those columns.
- Inquiries are relayed. A renter never sees host contact details from the app, and
  a host's reply is their own choice to make.

## Domain rules

- Metro Manila only: 16 cities plus Pateros. Reject anything outside.
- Rates are **indicative**, self-reported by hosts, and nothing is charged here.
  Any screen showing a rate says so.
- Never publish a `Space` without a `verifiedAt` on its `Host`. Unverified means a
  human has not confirmed the space is actually theirs to list.
- `HostApplication` rows never become listings automatically. A human reviews.
- Never invent a listing, a rate, a host, or a photo. Demo data is labelled as demo
  data, in the seed file and in the README.

## Address convention

Addresses are written real-down-to-the-street, bracketed below it:

```
[UNIT NO.] [BUILDING NAME], <real street>, <real area>, <real city>
```

Real and safe to write: city, barangay or area name, street. These are public
geography. Bracketed until a host gives them in writing: unit number, house number,
floor, building name, compound name — anything that identifies a specific property.

This applies to `exactAddress` in seed data and to every mockup, sample and test
fixture. A filled-in address anywhere in the repo is a claim that someone agreed to
be listed, so brackets are the default and removing them is a deliberate act.

`areaName` is public and never bracketed — it is the level the listing page shows.

## Non-negotiables

- TypeScript strict. No `any`, no `@ts-ignore`, no `!` to silence the compiler.
- Tests before implementation. A test that has never failed proves nothing.
- No new dependency without asking. Check MUI first.
- Never edit: `prisma/migrations/**`, lockfiles, `.env*`, `.next/`, `node_modules/`.
- Never run `git push` or `git rebase`. Commit locally; the human pushes.
- Keep diffs small. More than ~8 files means stop and propose a split.

## Conventions

- Server components by default. `"use client"` only where interactivity requires it,
  and as far down the tree as possible.
- Data access lives in `app/_lib/server/`. Components never call Prisma directly.
- Public queries use explicit `select`, never `include` on `Host`. This is a
  privacy rule wearing a convention's clothes.
- Styling via SCSS modules — see **Styling** below. No `sx`, no raw hex, no inline
  style objects.
- Loading, empty, and error states are required, not polish.
- Accessible by default: labelled inputs, keyboard reachable, semantic elements,
  touch targets at least 44px.
- Filter state lives in the URL as search params, not in React state.

## Styling

SCSS modules, not `sx`. Decided for slice 3 onward.

- Every component or route that needs styles gets a colocated `Name.module.scss`
  (`page.module.scss` for a route). Styles shared across routes go in
  `app/_styles/`.
- Tokens come from `app/_lib/theme.ts` only. MUI emits them as CSS custom
  properties (`cssVariables: true`), and SCSS reads those through
  `app/_styles/_tokens.scss`: `@use "../_styles/tokens" as *;` then `space(4)`,
  `$radius-lg`, `$color-verified`, `var(--mui-font-label)`. Never write a colour,
  spacing, radius or font value in SCSS. Add it to `theme.ts`, then name it in
  `_tokens.scss`.
- Literal values are fine only for layout measures: aspect ratios, percentages,
  and minimum column widths like `minmax(min(100%, 280px), 1fr)`.
- Prefer intrinsic layouts (`auto-fill`, `flex-wrap`) to media queries. Breakpoint
  values aren't exported as CSS variables, and CSS variables can't be used in
  media queries.
- MUI components stay. Their semantic props stay too: `variant`, `color`, `size`,
  `component`, `maxWidth`. Anything else visual goes in the module and is
  passed as `className`.
- **No `sx`, no `styled()`, no `style={{}}`, no CSS-in-JS for layout.** One
  benefit: server components stay server components. `sx` callbacks and
  `component={Link}` can't cross into MUI's client components.
- Theme-level overrides (the `components` key in `theme.ts`) stay where they are.
  That's the brand applied once, not per-component styling.

## Definition of done

1. `pnpm typecheck` clean
2. `pnpm test` passes, including new tests
3. `pnpm lint` clean
4. No host contact detail or exact address in any public response — checked, not assumed
5. Reviewed by the `reviewer` subagent before it reaches `main`
