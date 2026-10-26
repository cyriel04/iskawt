# Slice 7c-2 — The story: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write the deploy checklist, put the site live by following it, then rewrite the README for a hiring reader with the live URL and real screenshots.

**Architecture:** Docs only, no application code. Task 1 writes `docs/deploy.md`. Then a **human gate**: the human deploys by that checklist and runs its smoke check, which tests the checklist itself. Tasks 2–4 run after the gate and use what it produced: the live URL and screenshots of the live site.

**Tech Stack:** Markdown; headless Google Chrome for screenshots; `gh`/`curl` for checks.

**Spec:** `docs/superpowers/specs/2026-10-23-slice-7c-ship-design.md` (section "7c-2 — The story")

## Global Constraints

- Always "Iskawt", never "Iskwat" or "Scout".
- Never write a secret, a real email address or a connection string in any committed file. Examples use `<angle-bracket>` names.
- Every env var name written in the docs must exist in `.env.example`, spelled exactly the same.
- Demo data is called demo data wherever it appears. A screenshot must show the demo banner or badge.
- Screenshots show no real person's email address. The signed-in thread screenshot is cropped or taken so the account menu shows no address.
- The privacy claims in the README must match the code (`app/_lib/sentryScrub.ts`, `app/_lib/server/spaces.ts`, the seed). Check each claim against the code; don't assume it.
- Plain, short sentences. No marketing voice.
- Branch `feat/slice-7c-2-story`. Commit locally at each task with the `Co-Authored-By` line. Never push without the human asking.

## Review Focus

1. **A preview build with no env vars**: the reader expects the checklist to say exactly which placeholders make a preview build pass, and that previews never reach the production database. Task 1 lists them by name, scoped to Preview.
2. **No verified Resend domain**: the reader expects to be told that `onboarding@resend.dev` only delivers to the Resend account owner's own address, so the two-account thread check needs a verified domain. Task 1 states this.
3. **The Sentry event carries `x-ops-key`**: the reader expects the smoke check to confirm the test event shows no request headers, IP or query. Task 1's smoke step checks for that.
4. **A failed deploy after `migrate deploy` ran**: the reader expects to know that the old code is still live but the migration has already been applied. Task 1's "If a deploy fails" covers this.
5. **A fresh clone with an old local database**: the reader expects the README to give the one command that fixes the seed's refusal. Task 3 includes it.

---

### Task 1: `docs/deploy.md`, the deploy checklist

**Files:**
- Create: `docs/deploy.md`

- [ ] **Step 1: Write a check script (it fails now)**

Save as `$SCRATCH/check-deploy-doc.sh`, where `$SCRATCH` is the session scratchpad:

```bash
#!/usr/bin/env bash
# Every var in .env.example must appear in docs/deploy.md, and nothing secret-shaped may.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
f=docs/deploy.md
test -f "$f" || { echo "missing $f"; exit 1; }
fail=0
for v in $(grep -oE '^[A-Z_]+=' .env.example | tr -d '='); do
  grep -q "\`$v\`" "$f" || { echo "not documented: $v"; fail=1; }
done
grep -nE 'postgres(ql)?://[^<]*@[a-z0-9-]+\.neon\.tech|re_[A-Za-z0-9]{10,}|sntrys_|@gmail\.com' "$f" && { echo "secret-shaped text"; fail=1; }
exit $fail
```

Run: `bash $SCRATCH/check-deploy-doc.sh`. Expected: `missing docs/deploy.md`, exit 1.

- [ ] **Step 2: Write `docs/deploy.md`** with exactly this content:

````markdown
# Deploying Iskawt

Iskawt runs on **Vercel** (region `sin1`, Singapore), with **Neon** Postgres in Singapore, **Resend** for email and **Sentry** for errors. This checklist covers the first deploy. After that, every merge to `main` deploys on its own.

## How a deploy runs

Vercel runs `pnpm vercel-build` (`scripts/vercel-build.sh`, chosen by `vercel.json`):

1. `prisma generate`, always.
2. **Production only** (`VERCEL_ENV=production`): `prisma migrate deploy`, then `pnpm db:seed` if `DEMO_SEED=true`.
3. `next build`, always.

If any step fails, the build fails and the previous deployment stays live. Previews skip step 2 and never touch the production database.

Migrations run before the new code goes live, so for about a minute the old code runs against the new schema. Keep migrations additive. A rename or drop ships in two deploys: first add the new column and stop using the old one, then drop the old one.

## 1. Neon

1. Create a project in **AWS Asia Pacific (Singapore)**, Postgres 16 or newer.
2. From **Connect**, copy two connection strings for the default branch:
   - **Pooled** (the host contains `-pooler`): this becomes `DATABASE_URL`.
   - **Direct** (pooling switched off): this becomes `DIRECT_DATABASE_URL`. Migrations need it.
   Both end in `?sslmode=require`.
3. Leave the database empty. The first deploy creates the tables and loads the demo data. A fresh database has no `HostApplication` rows, so the slice 7a migration's required columns have nothing to backfill.

## 2. Resend

1. Add and verify a domain you own under **Domains** (Resend shows the DNS records to add).
2. Create an API key with **Sending access**: `RESEND_API_KEY`.
3. Pick the sender, for example `Iskawt <hello@<your-domain>>`: `EMAIL_FROM`.

**No domain yet?** `EMAIL_FROM=onboarding@resend.dev` works, but Resend then delivers only to the address that owns the Resend account. Sign-in works for that one address. The two-account thread check in step 6 doesn't, because it needs a second inbox.

In production the app refuses to start sending without both `RESEND_API_KEY` and `EMAIL_FROM` (`app/_lib/server/mailer.ts`).

## 3. Sentry

1. Create a **Next.js** project.
2. **Settings → Security & Privacy**: turn on **Data Scrubbing**, **Use Default Scrubbers** and **Prevent Storing of IP Addresses**. Under **Additional Sensitive Fields** add `address`, `body`, `detail`, `description`, `email` and `message`.
3. Leave Session Replay and Performance off. The app sends errors only (`tracesSampler: () => 0`).
4. Copy the DSN. It is both `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`.
5. Note the org slug (`SENTRY_ORG`) and project slug (`SENTRY_PROJECT`). Create an **Organization Auth Token** for source-map upload: `SENTRY_AUTH_TOKEN`. It is a secret.

The app scrubs every event to an allowlist before sending (`app/_lib/sentryScrub.ts`). The project settings are a backstop.

## 4. Vercel

1. Import the GitHub repo. Framework preset **Next.js**. Leave the build command alone: `vercel.json` sets it.
2. Note the production URL, for example `https://<project>.vercel.app`. Sign-in links point there.
3. **Settings → Environment Variables.** Scope each variable exactly as shown:

| Variable | Production | Preview |
|---|---|---|
| `DATABASE_URL` | Neon pooled URL | `postgresql://preview:preview@localhost:5432/unused` |
| `DIRECT_DATABASE_URL` | Neon direct URL | — |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | any placeholder, e.g. `preview-placeholder-not-a-secret` |
| `BETTER_AUTH_URL` | the production URL | `http://localhost:3000` |
| `RESEND_API_KEY` | from step 2 | — |
| `EMAIL_FROM` | from step 2 | — |
| `OPS_EMAIL_TO` | the inbox that gets report and host-application notices | — |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | the DSN | — |
| `SENTRY_ORG`, `SENTRY_PROJECT` | the slugs | — |
| `SENTRY_AUTH_TOKEN` | the token (mark it **Sensitive**) | — |
| `DEMO_SEED` | `true` | — |
| `OPS_TEST_KEY` | `openssl rand -hex 32` | — |

The Preview values are placeholders like the ones CI uses. `prisma generate` and Better Auth need a value to build. Nothing connects with them, so a preview build passes, and its data pages show the error state. Never give Preview the Neon URLs: a preview would then read, and could write, production data.

`REPORTS_EMAIL_TO` is the old name for `OPS_EMAIL_TO`. Don't set it on a new deploy.

## 5. First deploy

1. Redeploy (or push to `main`). In the build log, check for, in order: `prisma generate`, `prisma migrate deploy` with every migration applied, the seed finishing, then `next build`.
2. If the seed stops with a guard error, read it. It refuses to overwrite a non-demo space with a demo slug, and it refuses a demo space with no photo.

## 6. Smoke check

Run this after the first deploy, and after any deploy that changes auth, email or Sentry.

- [ ] **Browse** `/`: 8 spaces, each with a photo and the "Demo photo · not a real space" badge. The "This is a demo" banner sits under the header.
- [ ] **Listing** `/spaces/demo-poblacion-loft`: the gallery ends with the "Demo listing, for internal use only" tile. No exact address, no host email or phone anywhere on the page (view source too).
- [ ] **Sign in** with your email: the magic link arrives from `EMAIL_FROM` and signs you in.
- [ ] **Inquiry and host reply** (needs a verified Resend domain and a second inbox):
  1. Sign in as account B (your second address) once, then sign out.
  2. In Prisma Studio against the **direct** Neon URL (`DATABASE_URL=<direct url> pnpm db:studio`), open `User`, copy account B's `id`, then on `Host` set **Demo Host A**'s `userId` to it. The seed never touches `userId`, so the link survives redeploys.
  3. As account A, send an inquiry on a Demo Host A space. Demo hosts are never emailed, so no email goes out.
  4. As account B, open `/inbox`, open the thread, reply.
  5. Account A gets a "new message" email with no message text in it, only the space title and a link.
  6. In Studio, set Demo Host A's `userId` back to empty.
- [ ] **List your space** `/list-your-space`: submit the form. `OPS_EMAIL_TO` receives a notice with ids and public facts only.
- [ ] **Sentry route is locked:** `curl -i https://<prod-url>/api/ops/sentry-test` returns `404` with an empty body.
- [ ] **Sentry after():** `curl -i -H "x-ops-key: <OPS_TEST_KEY>" https://<prod-url>/api/ops/sentry-test` returns `202` and `{"scheduled":true}`. Within a minute Sentry shows the message `[ops] sentry smoke test`.
- [ ] **Sentry route errors:** the same command with `?mode=throw` returns `500`. Sentry shows `Error: Sentry smoke test`.
- [ ] **Both events are scrubbed:** open each one. There's no IP address, no request headers (in particular no `x-ops-key`), no query string, no cookies, and the user is an id or nothing.

## If a deploy fails

- **Build failed before `migrate deploy`:** nothing changed. Fix and redeploy.
- **Build failed after `migrate deploy`** (in the seed or `next build`): the old code is still live, and the new migration is already applied. That's safe only because migrations are additive. Fix forward; never edit an applied migration.
- **Bad code went live:** Vercel **Instant Rollback** to the previous deployment. Migrations aren't rolled back, which additive migrations make harmless.

## Ending the demo phase

1. Delete `DEMO_SEED` in Vercel.
2. In Prisma Studio, delete every `Space` with `isDemo = true` (their photos go with them), then the three `Demo Host` rows.
3. Redeploy. The banner disappears on its own once no demo space is public. The badges and the final tile only ever showed on demo spaces.
````

- [ ] **Step 3: Run the check**

Run: `bash $SCRATCH/check-deploy-doc.sh`. Expected: no output, exit 0.

- [ ] **Step 4: Cross-check facts against the code**

- `scripts/vercel-build.sh`: the step order and the `VERCEL_ENV`/`DEMO_SEED` conditions match "How a deploy runs".
- `app/api/ops/sentry-test/route.ts`: the header name `x-ops-key`, the `mode=throw` param, the 202 body and the message string match.
- `app/_lib/sentryScrub.ts`: the event really drops request headers, query strings, cookies and IP. If any of them is kept, correct the doc's claim (never the code in this slice) and record a ledger ruling.
- `prisma/seed.ts`: the host upsert's `update` doesn't set `userId`.

- [ ] **Step 5: Commit**

```bash
git add docs/deploy.md
git commit -m "docs(7c): deploy checklist — Neon, Resend, Sentry, Vercel, smoke check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### GATE: the human deploys (not an agent task)

The human pushes the branch and opens a PR for `docs/deploy.md` if they want it on `main` first. Then they follow `docs/deploy.md` steps 1–6 and report back:

- the production URL;
- which smoke-check boxes passed, and any that didn't;
- any step in the checklist that was wrong or unclear, which gets fixed in `docs/deploy.md` in Task 2.

Tasks 2–4 start only after this report.

---

### Task 2: Fix the checklist from the real deploy, take screenshots

**Files:**
- Modify: `docs/deploy.md` (only what the gate report says was wrong)
- Create: `docs/screenshots/browse.png`, `docs/screenshots/listing.png`, `docs/screenshots/list-your-space.png`, `docs/screenshots/thread.png`

- [ ] **Step 1: Apply the gate report's corrections to `docs/deploy.md`**, then re-run `bash $SCRATCH/check-deploy-doc.sh` (exit 0).

- [ ] **Step 2: Capture the public pages** from the live site with headless Chrome, 1440×1000:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="<production URL from the gate>"
mkdir -p docs/screenshots
"$CHROME" --headless=new --hide-scrollbars --window-size=1440,1000 --screenshot=docs/screenshots/browse.png "$URL/"
"$CHROME" --headless=new --hide-scrollbars --window-size=1440,1000 --screenshot=docs/screenshots/listing.png "$URL/spaces/demo-poblacion-loft"
"$CHROME" --headless=new --hide-scrollbars --window-size=1440,1000 --screenshot=docs/screenshots/list-your-space.png "$URL/list-your-space"
```

The listing shot has to show the final "Demo listing" tile. If it falls below the fold at 1000px, retake it with `--window-size=1440,1800`.

- [ ] **Step 3: The thread screenshot comes from the human.** It needs a signed-in session. Ask for `docs/screenshots/thread.png` from the smoke-check thread, 1440 wide, with no email address visible.

- [ ] **Step 4: Check every screenshot**: open each with Read. Each shows the demo banner or a demo badge, and none shows an email address, phone number or exact address. Recompress anything over 400 KB: `sips -s format png -Z 1440 <file>`.

- [ ] **Step 5: Commit**

```bash
git add docs/deploy.md docs/screenshots
git commit -m "docs(7c): screenshots of the live demo; checklist fixes from the first deploy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: README rewrite

**Files:**
- Modify: `README.md` (full rewrite)

- [ ] **Step 1: Write a check script (it fails on the current README)**

Save as `$SCRATCH/check-readme.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
f=README.md; fail=0
for s in "## Why it exists" "## Privacy, designed in" "## How it's built" "## Adding demo photos" "## What's next" "docs/deploy.md" "docs/screenshots/browse.png" "docs/screenshots/thread.png"; do
  grep -qF "$s" "$f" || { echo "missing: $s"; fail=1; }
done
# Every `pnpm <script>` named in the README exists in package.json.
for s in $(grep -oE 'pnpm (run )?[a-z:-]+' "$f" | awk '{print $NF}' | sort -u); do
  case "$s" in install|exec|dlx|approve-builds) continue;; esac
  node -e "process.exit(require('./package.json').scripts['$s']?0:1)" || { echo "no script: $s"; fail=1; }
done
# Relative links resolve.
for p in $(grep -oE '\]\(([^)#:]+)\)' "$f" | sed -E 's/\]\((.*)\)/\1/'); do
  test -e "$p" || { echo "broken link: $p"; fail=1; }
done
grep -n "Iskwat" "$f" && fail=1
exit $fail
```

Run it. Expected: several `missing:` lines, exit 1.

- [ ] **Step 2: Rewrite `README.md`** with this content. Replace `<LIVE_URL>` with the production URL from the gate:

````markdown
# Iskawt

**Private shoot spaces in Metro Manila.** A listing directory of apartments, studios, rooftops, cafés and warehouses whose owners are open to film and photo shoots. Renters browse and send an inquiry. Host and renter talk in an in-app thread, and arrange the rest themselves.

*Iskawt* is the Filipino respelling of "scout", as in location scouting.

**Live demo: <LIVE_URL>**

![Browse page of the live demo, showing demo spaces with photo badges](docs/screenshots/browse.png)

> **This is a demo.** Every listing is sample data. No real host has agreed to any of it. The photos are AI-generated, and every one carries a "Demo photo · not a real space" badge. Titles carry a `[DEMO]` marker, hosts are "Demo Host A", "Demo Host B" and so on, rates are illustrative, and anything that would identify a property is written in `[BRACKETS]`. Only public geography (city, area, street) is real. An inquiry on a demo listing is saved, but it reaches nobody.

## Why it exists

Shoots in Manila find locations through friends of friends and Facebook groups. A space owner who'd happily rent out a loft for a day has no safe way to say so without posting their address and phone number to strangers. Iskawt is the narrow version of that marketplace: a directory and a relay. There are no payments, bookings or calendars. A listing never shows an address or a contact detail, and a host decides in the thread whether to share them.

It's also a portfolio piece. It shows how I scope a product, design privacy into the data layer, and run an AI-agent workflow with review gates.

## What it does

- **Browse and search**: filter by city, space type, indoor or outdoor, natural light, crew size and rate. Every filter lives in the URL, so a link reproduces the view.
- **Listing pages**: photos, practical specs (ceiling height, power, blackout, noise, parking, load-in), indicative rates, house rules and past credits.
- **Accounts**: magic-link sign-in. Browsing never needs an account.
- **Inquiries and threads**: a signed-in renter sends an inquiry, and host and renter message each other in `/inbox`.
- **Safety**: either side can block the other or report a conversation. A host who loses verification can no longer message anyone.
- **List your space**: a host application form. A person reviews every application. Nothing becomes a listing automatically.

| Listing | Thread | List your space |
|---|---|---|
| ![Listing page ending in the demo disclaimer tile](docs/screenshots/listing.png) | ![An inquiry thread between renter and host](docs/screenshots/thread.png) | ![The list-your-space application form](docs/screenshots/list-your-space.png) |

Rates are **indicative**: hosts report them, and nothing is charged here. Metro Manila only: the 16 cities plus Pateros.

## Privacy, designed in

A listing is about someone's home or business. The rules below are enforced in the data layer and tested. They aren't left to the UI.

- **Host contact details are never public.** Every public query uses an explicit `select`. `include: { host: true }` on a public path is a bug, and tests assert that no public result carries a host email or phone.
- **Exact addresses are never public.** A listing shows area and city. The host shares the address in the thread, if they choose to.
- **Coordinates are approximate.** The demo data stores rough area centres. Real listings will store coordinates jittered by about 300m, so a future map can't point at a doorstep.
- **Inquiries are relayed.** Neither side sees the other's email or phone unless they type it into a message.
- **Emails carry no typed text.** Notification emails contain the space title and a link: no sender name, no message body. Someone can't use Iskawt's domain to deliver their own words to a stranger's inbox. Requester names that impersonate Iskawt, or contain URLs, emails or mixed-script lookalikes, are rejected.
- **Every public space has a verified host and at least one photo.** A person confirms that a host really controls the space before it's published.
- **Error monitoring sees an allowlist.** Every Sentry event passes through one pure, tested function (`app/_lib/sentryScrub.ts`). It keeps error types, stack frames and a fixed set of ops messages, and drops everything else: no request bodies, headers, queries, cookies or IPs. Tracing and replay are off. The user is an opaque id or nothing.

## How it's built

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict |
| UI | MUI 9; styling in SCSS modules that read theme tokens, with no `sx` or inline styles |
| Data | Prisma 7 with the `@prisma/adapter-pg` driver adapter, PostgreSQL (Neon in production) |
| Auth and email | Better Auth magic links; Resend over `fetch` |
| Errors | Sentry, errors only, scrubbed to an allowlist |
| Tests | Jest and React Testing Library, written before the code they cover |
| Hosting | Vercel (Singapore) and Neon (Singapore) |

**Agent workflow.** The repository is built with [Claude Code](https://claude.com/claude-code). Each slice goes brainstorm → written spec → written plan → execution. A `frontend-dev` and a `backend-dev` agent implement it, each owning its own files, and a fresh read-only `reviewer` checks every task and then the whole branch. The rules the agents follow (privacy, styling, ownership, definition of done) are in [`CLAUDE.md`](CLAUDE.md). Specs and plans are in [`docs/superpowers/`](docs/superpowers), and the slice history is in [`PLAN.md`](PLAN.md).

**CI.** Every PR runs typecheck, lint, tests and a production build. A second job applies every migration to a throwaway Postgres, fails if `schema.prisma` has changes with no migration, and loads the seed.

**Deploys.** A merge to `main` deploys to Vercel. The build applies migrations to Neon and re-seeds the demo data, in production only. If any step fails, the previous version stays live. Migrations run before the new code goes live, so they're kept additive, and a rename or drop ships in two deploys. The full checklist is [`docs/deploy.md`](docs/deploy.md).

## Getting started

You need **Node.js 24**, **pnpm** (run `corepack enable`; the version is pinned in `package.json`) and **Docker** for the local Postgres.

```bash
git clone https://github.com/cyriel04/iskawt.git
cd iskawt
corepack enable
pnpm install
docker compose up -d          # Postgres 16 on port 5432
cp .env.example .env          # every variable is listed there with a note
```

In `.env`, set `BETTER_AUTH_SECRET` to 32+ random characters (`openssl rand -base64 32`). The other defaults work locally. Without Resend keys, emails, including sign-in links, print to the terminal.

```bash
pnpm exec prisma generate         # writes the client to /generated (gitignored)
pnpm exec prisma migrate deploy   # creates the tables
pnpm db:seed                      # loads the 8 demo spaces; safe to re-run
pnpm dev                          # http://localhost:3000
```

**Seed refuses with "not a demo space"?** Your local database is older than the `isDemo` flag. Mark the old demo rows, then re-run the seed:

```bash
docker exec iskawt-db psql -U iskawt -d iskawt -c "UPDATE \"Space\" SET \"isDemo\" = true WHERE slug LIKE 'demo-%';"
```

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server on port 3000 |
| `pnpm build` / `pnpm start` | Production build, and serving it |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` / `pnpm lint:fix` | ESLint (flat config) |
| `pnpm test` / `pnpm test:watch` | Jest |
| `pnpm db:migrate` | Create and apply a migration after editing `prisma/schema.prisma` |
| `pnpm db:seed` | Load the demo data |
| `pnpm db:studio` | Prisma Studio, which is also the admin UI in v1 |

Before a PR: `pnpm typecheck && pnpm lint && pnpm test`.

## Adding demo photos

Demo photos live in `public/demo/<slug>/1.jpg`, `2.jpg`, `3.jpg`. The lowest number is the cover. The prompts used to generate them, and the rules they follow (no people, no text or logos, no real landmarks), are in [`docs/demo-photos.md`](docs/demo-photos.md). Save JPEGs about 1600px wide and under 400 KB, then run `pnpm db:seed`. It replaces each space's photos with whatever is in its folder. A space with no files gets an SVG placeholder for its type.

Only `isDemo` spaces may use generated photos. Real spaces get real photos from their host.

## What's next

- **Real hosts, and the end of the demo phase.** Turn off `DEMO_SEED`, delete the demo rows, and list spaces whose owners said yes in writing. Steps are in [`docs/deploy.md`](docs/deploy.md#ending-the-demo-phase).
- **A map**, once real coordinates are stored jittered, with a privacy review first.
- **An admin review screen** for host applications and reports. Today that's Prisma Studio.
- **End-to-end tests** with Cypress.
````

- [ ] **Step 3: Check every claim against the code.** For each bullet under "Privacy, designed in", open the file that enforces it and confirm it:
  - `app/_lib/server/spaces.ts`: explicit `select`, `publishedWhere` (verified host and photo);
  - `app/_lib/server/inquiryEmail.ts`: no typed text;
  - the requester-name filter (find it with `grep -rn requesterName app/_lib/server`);
  - `app/_lib/sentryScrub.ts`: what's kept and what's dropped;
  - `prisma/seed.ts`: coordinates.
  Rewrite any claim the code doesn't support. Don't change the code.

- [ ] **Step 4: Run the check**

Run: `bash $SCRATCH/check-readme.sh`. Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(7c): README for readers — live demo, why, privacy model, how it's built

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `PLAN.md`, 7c done

**Files:**
- Modify: `PLAN.md`

- [ ] **Step 1: Replace the slice 7 block's 7c line and the stale bullets under it.** Replace this:

```markdown
7c, ship: Vercel, Neon and the README. It gets its own spec. The deploy checklist includes the Sentry project
  settings (data scrubbing and IP scrubbing on) and confirming `HostApplication` is empty before `migrate deploy`.


- **backend-dev:** `POST /api/host-applications` → `HostApplication` in `PENDING`.
  Never creates a `Host` or `Space` directly.
- **frontend-dev:** "List your space" page and form.
- **You:** review applications in Prisma Studio and create rows by hand. No admin
  UI in v1 — building one is how side projects die.
- Deploy: Vercel + Neon Postgres.
- README with screenshots, the product rationale, the privacy model, and what's
  next. This is the part a hiring reader actually reads.
```

with this:

```markdown
7c, ship (done): live at <LIVE_URL> as a portfolio demo running the `[DEMO]` seed.
  Spec: `docs/superpowers/specs/2026-10-23-slice-7c-ship-design.md`. Deploy checklist: `docs/deploy.md`.
  Host applications are reviewed in Prisma Studio; rows are created by hand. No admin UI in v1.
```

Change the heading `## Slice 7 — Host applications and ship` to `## Slice 7 — Host applications and ship (done)`.

- [ ] **Step 2: Verify**: `grep -n "7c, ship (done)" PLAN.md` prints one line, and `grep -c "<LIVE_URL>" PLAN.md README.md` prints `0` for both.

- [ ] **Step 3: Commit**

```bash
git add PLAN.md
git commit -m "docs(plan): slice 7c done

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Final review

A fresh `reviewer` reads the whole branch diff against this plan and the spec. It checks that no secret, real email or connection string is in any file or screenshot, that every privacy claim matches the code, that every env name matches `.env.example`, and that the "Iskawt" spelling is right.
