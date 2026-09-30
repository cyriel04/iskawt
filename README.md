# Iskawt

**Private shoot spaces in Metro Manila.** Iskawt is a listing directory of apartments, studios, rooftops, cafés and warehouses whose owners are open to film and photo shoots. Hosts list a space; renters browse, filter and send an inquiry; the two arrange the rest between themselves.

*Iskawt* is the Filipino respelling of "scout", as in location scouting.

> **Demo data.** Every listing in this repository is demo data. No real host has agreed to any of it. Titles carry a `[DEMO]` marker, hosts are named "Demo Host A", "Demo Host B" and so on, rates are illustrative, and anything that would identify a property (unit, house number, building name) is written in `[BRACKETS]`. Only public geography is real: city, area and street.

## What it does, and what it doesn't

- **Inquiry only.** No payments, bookings, calendars or reviews. Rates are **indicative**: hosts report them, and nothing is charged here.
- **Metro Manila only**: the 16 cities plus Pateros.
- **Private spaces only.** Public locations, streets and government permits are out of scope.

### Privacy model

A listing is about someone's home or business, so privacy is designed into the data layer. It isn't left to the UI.

- **Host contact details are never public.** Host emails and phone numbers live in a separate table and are never selected by any public query. Every public read uses an explicit `select`; `include: { host: true }` on a public path is treated as a bug. Tests check that no public result carries these fields.
- **Exact addresses are never public.** A listing shows its area and city. The host shares the address privately after accepting an inquiry.
- **Coordinates are approximate.** Stored latitude and longitude are only area-level (the demo data uses rounded area centres), so a future map can never lead to a doorstep.
- **Inquiries are relayed.** Renters never see host contact details, and a host's reply is their own choice to make.
- **Every published space has a verified host.** A space is public only when it is published and a person has confirmed the host really owns it.

## Features

- **Browse** published spaces, each card showing its cover photo, area, space type, headline rate, size, crew capacity and light.
- **Listing detail** with photos, practical specs (ceiling height, power, blackout, noise, parking, load-in), indicative rates, house rules and past film credits.
- **Search** across title, description, area, tags, city names and space types. Every word you type must match somewhere. Matching ignores case, accents and hyphens, so `marikina`, `quezon-city`, `las pinas` and `studios` all work.
- **Filters**: city, space type, indoor or outdoor, natural light, minimum crew and hourly rate range, with a removable chip for each active filter and paginated results.
- **Shareable URLs.** Every filter lives in the URL, so a filtered link pasted into a new tab shows the same results, for example `/?city=makati&type=studio&crew=10`.

**Coming next:** the inquiry form and relay (slice 5), then host applications and deployment (slice 6). See [`PLAN.md`](PLAN.md).

## Tech stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict) |
| UI | MUI 9 with Emotion; styling in SCSS modules that read theme tokens |
| Data | Prisma 7 with the `@prisma/adapter-pg` driver adapter, PostgreSQL 16 |
| Tests | Jest and React Testing Library |
| CI | GitHub Actions: typecheck, lint, test, build, and migration checks on every PR |
| Package manager | pnpm 12 (pinned in `package.json`) |

## Getting started

### Prerequisites

- **Node.js 24**
- **pnpm 12.6.0**: run `corepack enable` and the version pinned in `package.json` is used automatically
- **Docker**, for the local Postgres database

### Setup

```bash
git clone https://github.com/cyriel04/iskawt.git
cd iskawt

corepack enable
pnpm install

# Start Postgres 16 in Docker (user, password and database are in docker-compose.yml)
docker compose up -d
```

Create a `.env` file in the repository root with the connection string for that database:

```bash
DATABASE_URL="postgresql://iskawt:devpassword@localhost:5432/iskawt?schema=public"
```

Then generate the Prisma client, create the tables and load the demo data:

```bash
pnpm exec prisma generate          # writes the client to /generated (gitignored)
pnpm exec prisma migrate deploy    # applies prisma/migrations to the empty database
pnpm db:seed                       # loads the demo spaces; safe to re-run
```

Start the app:

```bash
pnpm dev
```

Open <http://localhost:3000>. You should see the demo spaces. Try <http://localhost:3000/?q=rooftop> or <http://localhost:3000/?city=manila>.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the development server on port 3000 |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm typecheck` | Type-check with `tsc --noEmit` |
| `pnpm lint` | Lint with ESLint (flat config) |
| `pnpm lint:fix` | Lint and apply automatic fixes |
| `pnpm test` | Run the Jest suite |
| `pnpm test:watch` | Run Jest in watch mode |
| `pnpm db:migrate` | Create and apply a new migration after editing `prisma/schema.prisma` (`prisma migrate dev`) |
| `pnpm db:push` | Push the schema to the database without creating a migration (prototyping only) |
| `pnpm db:seed` | Load the demo data |
| `pnpm db:studio` | Open Prisma Studio to browse and edit the database |

Before opening a pull request, run `pnpm typecheck && pnpm lint && pnpm test`. CI runs the same checks, plus `pnpm build` and the database checks below.

## Project structure

```
app/
  (browse)/page.tsx         browse, search and filters at /
  spaces/[slug]/page.tsx    listing detail
  api/                      route handlers, the only write paths (from slice 5)
  _components/              UI components, each with its own Name.module.scss
  _styles/                  SCSS token names and shared styles
  _lib/
    types.ts                the public types shared by pages and queries
    constants/              display labels, limits, site copy
    spaceFilters.ts         URL search params ↔ filters
    server/                 database queries (explicit selects only)
    db.ts                   the one PrismaClient
    theme.ts                design tokens, the only place colour and spacing values live
prisma/                     schema, migrations, demo seed
docs/mockups/               static HTML mockups (layout reference only)
```

Folders that start with `_` are Next.js private folders, so they sit inside `app/` without becoming URLs.

## Continuous integration

`.github/workflows/ci.yml` runs two jobs on every pull request to `main` and every push to `main`:

- **checks**: frozen-lockfile install, Prisma client generation, typecheck, lint, tests and production build.
- **database**: on a throwaway Postgres, applies every migration, fails if `schema.prisma` has changes with no migration for them, and loads the seed.

If the drift check fails, run `pnpm db:migrate` and commit the migration it creates.

## Contributing

The conventions this codebase follows are written down in [`CLAUDE.md`](CLAUDE.md): styling rules, ownership boundaries, the privacy rules and the definition of done. Read it first. A few that matter most:

- Public queries use explicit `select`, never `include` on `Host`.
- No `any`, no `@ts-ignore`, no non-null `!`. Write tests first.
- Style with SCSS modules and theme tokens: no `sx`, no inline styles, no raw colours.
- Keep filter and search state in the URL, not in React state.
- Never edit applied migrations, lockfiles or `.env` files by hand.

This repository is also set up for [Claude Code](https://claude.com/claude-code). `.claude/agents/` defines a `frontend-dev`, a `backend-dev` and a read-only `reviewer`, and each slice follows the loop in [`PLAN.md`](PLAN.md).
