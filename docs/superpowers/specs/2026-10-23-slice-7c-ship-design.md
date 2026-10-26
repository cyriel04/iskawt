# Slice 7c — Ship: design

**Status:** approved in conversation, 2026-10-23
**Branch:** `feat/slice-7c-ship`
**Splits into:** 7c-1 "deployable" (code) and 7c-2 "the story" (docs, after the site is live)

## Intent

Put Iskawt on the public internet as a **portfolio demo** for hiring readers. Production
runs the `[DEMO]` seed so there is something to browse, with realistic AI-generated
photos, and every surface makes clear that none of it is real. Real hosts come later;
ending the demo phase must be a settings change plus a data cleanup, not a rewrite.

Success looks like:

- A merge to `main` deploys to Vercel, applies migrations to Neon, re-seeds demo data,
  and fails safe (old version stays live) if any step fails.
- Browse shows 8 demo spaces, each with photos, each visibly marked demo.
- A space with no photo is never public.
- Sentry receives a scrubbed test event from production, proving the 7b setup and the
  `opsError`-in-`after()` flush.
- The README tells a hiring reader what this is, why, and how privacy is designed in.

Decisions made with the human:

| Question | Decision |
|---|---|
| Who is the live site for | Portfolio demo; production runs the demo seed |
| Demo photos | AI-generated realistic photos (the human generates them from `docs/demo-photos.md`), SVG placeholder fallback per space type |
| "Never invent a photo" | Demo-phase exception, scoped to `isDemo` spaces, visibly marked |
| Disclaimer | Badge on every demo photo + final gallery tile + site-wide banner |
| Photo required to be public | Yes, at least one |
| Migrations and seed in production | A production-gated `vercel-build` script |
| How a space is known to be demo | New `Space.isDemo` column (contract change, approved) |

## 7c-1 — Deployable

### Contract changes (approved)

`prisma/schema.prisma`:

```prisma
model Space {
  // …existing fields
  isDemo Boolean @default(false)
}
```

With a migration from `pnpm db:migrate` (never hand-edited).

`app/_lib/types.ts`: `SpaceCard` gains `isDemo: boolean`. `SpaceDetail` inherits it.
`isDemo` is not private; selecting it publicly is fine.

### Photo requirement

`publishedWhere` in `app/_lib/server/spaces.ts` gains `photos: { some: {} }`. Every
public read already goes through it (browse list, count, detail by slug), so:

- a space with no photos is missing from browse and from the count;
- its detail URL returns 404, as an unpublished space does.

Tests: the where clause includes the photo condition; `buildSpaceWhere` with no filters
still equals `publishedWhere`.

### Demo marking (frontend)

On a space with `isDemo`:

- **`PhotoFrame`** takes `demo: boolean`. When true it overlays a small corner badge,
  "Demo photo · not a real space". Shown on cards and in the gallery. The badge is real
  text, not part of the image, and doesn't replace the alt text.
- **Final gallery tile** on `app/spaces/[slug]/page.tsx`, same shape as a gallery photo:
  "Demo listing, for internal use only. Photos, rates and host are not real."
- **Site-wide banner** under the header while any demo space is public: "This is a
  demo. Every listing is sample data." The root layout asks
  `hasPublicDemoSpaces(): Promise<boolean>` (backend, `spaces.ts`; one `findFirst` on
  `{ ...publishedWhere, isDemo: true }` selecting `id`) and degrades to `false` on error,
  as it already does for `getCurrentUser`.

Real spaces show none of these. `PhotoFrame` keeps its "No photos yet" state for
`photo: null`; the public pages can no longer reach it, and that's fine.

### Seed

`prisma/seed.ts`:

- Every seeded space gets `isDemo: true`.
- **Photos.** For each space, read `public/demo/<slug>/` for files matching
  `/^\d+\.(jpe?g)$/i`, sorted numerically. The lowest-numbered file is the cover (`isCover: true`,
  `sortOrder: 0`), the rest follow in order. URL is `/demo/<slug>/<file>`.
- **Fallback.** No matching files → one photo, `/demo/placeholders/<type>.svg` where
  `<type>` is the space's `SpaceType` lowercased, as the cover.
- **Alt text.** Each space carries an `alts: string[]` in the seed, one per prompt in
  `docs/demo-photos.md`, each starting "Demo photo: ". The fallback SVG's alt is
  "Demo placeholder: <space type label>". A file with no matching entry in `alts`
  gets "Demo photo: <title without the [DEMO] marker>, photo <n>".
- **Replace, don't append.** Photos of a demo space are deleted and recreated in the
  same transaction as its upsert, so re-running the seed after adding files gives the
  new set, never duplicates.
- **Guards** (throw, exit non-zero):
  - a seeded slug already exists with `isDemo: false` — never overwrite a real listing;
  - a demo space would end with zero photos.

Placeholders: `public/demo/placeholders/<type>.svg` for each `SpaceType` used by the
seed (apartment, house, office, warehouse, cafe, rooftop, studio). Simple flat SVG
scene, 2:1, tokens don't apply (static files), stamped "DEMO".

Committed photos: JPEG, quality ~75, under ~400 KB each. The human generates them;
the main session converts with macOS `sips` before committing.

### Build pipeline

- `vercel.json`: `{ "buildCommand": "pnpm vercel-build", "regions": ["sin1"] }`.
- `package.json` script `"vercel-build": "bash scripts/vercel-build.sh"`.
- `scripts/vercel-build.sh`, `set -euo pipefail`:

  ```sh
  prisma generate                                   # always
  if VERCEL_ENV=production:
      prisma migrate deploy
      if DEMO_SEED=true: pnpm db:seed
  next build                                        # always
  ```

  Each step echoes its name. Never echoes env values.
- Preview deployments get no production database variables (set Production-only in
  Vercel), so a preview never migrates or seeds production.
- **Additive migrations.** Migrations run before new code goes live, so for a minute
  the old code runs against the new schema. A rename or drop ships in two deploys.

Tests: a Jest test runs the script with stub `prisma`, `pnpm` and `next` executables
first on `PATH`, each appending its argv to a log file, and asserts the logged steps
for: production + `DEMO_SEED=true`; production without it; preview; and a failing
`migrate deploy` stops before `next build`.

### Direct database URL

`prisma.config.ts` uses `DIRECT_DATABASE_URL` when set, else `DATABASE_URL`. Neon's
pooled URL serves the app; migrations need the direct one. Local and CI are unchanged.

### Sentry smoke route

`GET /api/ops/sentry-test` (backend):

- `OPS_TEST_KEY` unset, or header `x-ops-key` missing or not equal (constant-time
  compare) → **404**, same body as any unknown route.
- Key matches → schedules `opsError("sentry smoke test")` in `after()`, then throws
  `new Error("Sentry smoke test")` so the route's 500 is captured too. The message is
  a fixed string; nothing from the request is attached.
- `"sentry smoke test"` joins the `OpsMessage` union.

Tests: 404 with no env, 404 with wrong key, 404 with no header; throws with the right
key and schedules exactly one `opsError`.

### Env and rules

`.env.example` adds, with comments: `DIRECT_DATABASE_URL`, `DEMO_SEED`, `OPS_TEST_KEY`.

`CLAUDE.md`:

- Domain rules: "Never invent … a photo" gains: *Demo-phase exception: AI-generated
  photos are allowed only on `isDemo` spaces, and only while the site marks them as
  demo (badge, final tile, banner). Real spaces get real photos from their host.*
- Domain rules: *A space with no photo is not public — `publishedWhere` requires one.*
- Toolchain gotchas: *Vercel builds with `pnpm vercel-build`
  (`scripts/vercel-build.sh`), which migrates and seeds in production only. Keep
  migrations additive; a rename or drop ships in two deploys.*

## 7c-2 — The story (after the site is live)

- `docs/deploy.md`: the deploy checklist — Neon (Singapore, pooled + direct URLs),
  Resend domain verification, Sentry project (Data Scrubber, default scrubbers,
  prevent storing IPs, auth token), Vercel (Production-only env vars, `DEMO_SEED=true`,
  `OPS_TEST_KEY`), first deploy, and the post-deploy smoke check: browse with photos and
  badges, listing tile, magic-link sign-in, an inquiry and a host reply (temporarily
  link a demo host to your account in Studio, then unlink), "List your space" ops email,
  `curl -H "x-ops-key: …" /api/ops/sentry-test` and checking the event is scrubbed.
- README rewrite: hero + live URL + screenshot; demo notice; why it exists; screenshots
  (browse, listing with tile, thread, list-your-space) in `docs/screenshots/`; privacy
  model incl. Sentry allowlist, text-free emails, blocking; how it's built (stack, agent
  workflow, CI, deploy pipeline, additive migrations); getting started + "Adding demo
  photos"; what's next (real hosts / end of demo phase, map with jittered coordinates,
  admin review screen, Cypress).
- `PLAN.md`: 7c done.

## Ending the demo phase (documented, not built)

Remove `DEMO_SEED` in Vercel; delete `isDemo` spaces in Studio. Banner disappears on
its own; badges and tiles only ever showed on demo spaces.

## Out of scope

Preview databases (Neon branching), a custom domain purchase, image optimisation via
`next/image` (photos stay `unoptimized`), uploading photos through the app, rate-limit
and body-size hardening, recovering scrubbed Sentry messages.

## Risks accepted

- The seed resets Studio edits to demo rows on every production deploy.
- A preview deployment opened in a browser errors on data pages (no database).
- The banner costs one indexed query per page render.
