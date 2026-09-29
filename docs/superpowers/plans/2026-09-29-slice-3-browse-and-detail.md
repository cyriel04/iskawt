# Slice 3 — Browse and Listing Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/` lists every published space as a card, and `/spaces/[slug]` shows one space in full: photos, practical specs, indicative rates. Both have loading, empty, error and not-found states, and no private host or address data reaches either page.

**Architecture:** Server components read through `app/_lib/server/spaces.ts`. It is the only file that touches Prisma, and it maps rows into the approved public types in `app/_lib/types.ts` using explicit `select` objects. Presentational components in `app/_components/` take those types as props and are styled with colocated SCSS modules. The modules read design tokens as the CSS variables MUI generates from `app/_lib/theme.ts`. Routes are thin: fetch, handle empty/not-found, compose components.

**Tech Stack:** Next.js 16.3.6 (App Router, Turbopack), React 19, MUI 9 + Emotion (components), SCSS modules via `sass` 1.105 (styling), Prisma 7.10 (`prisma-client` generator, `@prisma/adapter-pg`), Jest 30 + React Testing Library 16.

**Spec:** `PLAN.md` → "Slice 3 — Browse and listing detail"; `CLAUDE.md`, especially **Privacy rules**, **Styling**, **Toolchain gotchas** and **Definition of done**; and the approved contract `app/_lib/types.ts`. Layout reference only: `docs/mockups/*.html`.

## Global Constraints

- **Never run `git commit` or `git push`.** Each part ends at a checkpoint: stop, report, and the human reviews and commits.
- `app/_lib/types.ts` is the contract. Do not edit it. If a shape seems wrong, stop and report.
- Never edit `prisma/migrations/**`, `generated/**`, lockfiles, `.env*`, `.next/`, `node_modules/`.
- No new dependencies. `sass` is already installed. **Cypress is deferred to v2**, so this slice has no e2e spec.
- `Host.contactEmail`, `Host.contactPhone`, `Space.exactAddress`, `latitude`, `longitude` and `barangay` never appear in a select, a prop, a response or a log line.
- Public queries use explicit `select`. `include` on anything, and `host: true` anywhere, are bugs.
- A space is public only when `status: "PUBLISHED"` **and** its host has `verifiedAt` set.
- Every screen that shows a rate says rates are indicative.
- Never invent a listing, rate, host or photo. Fixtures are DEMO data (`[DEMO]` titles, `example.invalid` URLs).
- **Styling is SCSS modules only** (CLAUDE.md → Styling). No `sx`, no `styled()`, no `style={{}}`. Every colour, gap, radius and font comes through `app/_styles/_tokens.scss` (`space(n)`, `$radius-lg`, `$color-verified`, `var(--mui-font-*)`). Only layout measures may be literal: aspect ratios, percentages, min column widths. MUI's semantic props (`variant`, `color`, `size`, `component`, `maxWidth`) are fine.
- TypeScript strict. No `any`, no `@ts-ignore`, no non-null `!`.
- Server components by default. **Every component in this plan is a server component** except `app/error.tsx`, which Next.js requires to be a client component.
- Tests first. Run each new test and watch it fail before writing the implementation.
- Keep each part at or under ~8 files, not counting deletions.
- Commands: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Run a single test file with `pnpm test -- --runTestsByPath "<path>"`. The quotes and `--runTestsByPath` matter: `(browse)` and `[slug]` are regex syntax otherwise.
- If `pnpm typecheck` reports `.next/types/validator.ts … Cannot find module '../../app/…/page.js'`, the generated route types are stale. Run `pnpm build` to regenerate them (never edit `.next/` by hand), then re-run typecheck.

## Decisions already made (don't relitigate)

| Decision | Why |
| --- | --- |
| Enum types are re-exported from `generated/prisma/enums.ts` via `types.ts` | No hand-copied lists to drift; that file is browser-safe. |
| No `barangay`, no coordinates on any public type | Human decision; maps are out of v1. |
| Film credits appear on the detail page | Human decision. |
| SCSS modules, not `sx` | Human decision, recorded in CLAUDE.md → Styling. Tokens stay in `theme.ts`, and MUI's `cssVariables: true` emits them (`--mui-spacing`, `--mui-radius-lg`, `--mui-palette-verified-main`, `--mui-font-label`, …). |
| Intrinsic layouts (`auto-fill`, `flex-wrap`), no media queries | Breakpoints aren't exported as CSS variables, and CSS variables can't be used in media queries anyway. |
| `SpaceCard` is a server component: MUI `Card` + Next `Link` with a `className` | With SCSS there's no need for `CardActionArea component={Link}`, which would force a client boundary. |
| No "Verification pending" state | Unverified hosts are never public, so the mockups' pending badge can't occur. |
| Detail "Where" shows `areaName, city` only | The mockup's street line is the `exactAddress` format, which is private. |
| No inquiry button yet | Slice 5. |
| Photos use `next/image` with `unoptimized` | Photo hosting isn't decided; optimized images need that origin in `remotePatterns`. |
| Browse lives in route group `app/(browse)/` with its own `loading.tsx`; the detail page has none | Verified: a root `app/loading.tsx` streams the shell before `notFound()`, so missing slugs return **200**. CLAUDE.md → Toolchain gotchas. |
| `error.tsx` never renders or logs `error`; its prop is `retry` | Dev error messages can include query details. Next 16 renamed `reset` → `retry`. |
| `layout.tsx` imports `@mui/material-nextjs/v16-appRouter` | The repo is on Next 16; the v15 entry was a leftover. |

## File map

| Part | File | Responsibility |
| --- | --- | --- |
| 1 | `jest.config.ts` (modify) | Map `@/*` for Jest, which doesn't read tsconfig paths |
| 1 | `app/_lib/types.ts` (already written, uncommitted) | The approved public contract |
| 1 | `app/_lib/server/spaces.ts` + `.test.ts` | Published-space queries, explicit selects, mappers |
| 2 | `app/layout.tsx` (modify) | v16 MUI cache entry |
| 2 | `app/_styles/_tokens.scss` | SCSS names for theme CSS variables; `page` mixin |
| 2 | `app/_styles/message.module.scss` | Full-page message layout (error, not-found) |
| 2 | `app/_components/labels.ts` + `.test.ts` | Enum labels, peso formatting, location line, headline rate |
| 2 | `app/_components/testing.tsx` | Test-only: `renderWithTheme`, DEMO fixtures |
| 2 | `app/error.tsx` + `.test.tsx` | App-wide error boundary |
| 3 | `app/_components/PhotoFrame.tsx` + `.module.scss` | One photo, or "No photos yet" |
| 3 | `app/_components/SpaceCard.tsx` + `.module.scss` + `.test.tsx` | Browse card |
| 4 | `app/_components/BrowseResults.tsx` + `.module.scss` + `.test.tsx` | Counted card grid, or the empty state |
| 4 | `app/(browse)/page.tsx` + `page.module.scss` + `page.test.tsx` | `/` route |
| 4 | `app/(browse)/loading.tsx` | Browse skeleton |
| 4 | `app/page.tsx`, `app/page.module.css` (delete) | create-next-app boilerplate |
| 5 | `app/_components/RatePanel.tsx` + `.module.scss` + `.test.tsx` | Rates, indicative note, public host block |
| 5 | `app/_components/SpaceFacts.tsx` + `.module.scss` + `.test.tsx` | Specs, Getting in, Shot here |
| 6 | `app/spaces/[slug]/page.tsx` + `page.module.scss` + `page.test.tsx` | Detail route + metadata |
| 6 | `app/spaces/[slug]/not-found.tsx` | Unknown or unpublished slug |

**Agent routing** (CLAUDE.md ownership map): Part 1 → `backend-dev`. Parts 2–6 → `frontend-dev`. After each part → `reviewer`.

---

# Part 1 — Data layer (`backend-dev`)

### Task 1: Published-space queries

**Files:**
- Modify: `jest.config.ts`
- Create: `app/_lib/server/spaces.ts`
- Test: `app/_lib/server/spaces.test.ts`
- Already present, uncommitted: `app/_lib/types.ts` (do not edit)

**Interfaces:**
- Consumes: `SpaceCard`, `SpaceDetail`, `PublicPhoto` from `@/app/_lib/types`; `prisma` from `@/app/_lib/db`; the `Prisma` type namespace from `@/generated/prisma/client`.
- Produces:
  - `listPublishedSpaces(): Promise<SpaceCard[]>`, newest listing first
  - `getPublishedSpaceBySlug(slug: string): Promise<SpaceDetail | null>`, wrapped in React `cache()` so `generateMetadata` and the page share one query
  - `publishedWhere`, `cardSelect`, `detailSelect`, `toSpaceCard`, `toSpaceDetail` (exported for tests)

- [ ] **Step 1: Teach Jest the `@/` alias**

Replace `jest.config.ts` with the following. `next/jest` already maps `*.module.scss` imports to a class-name proxy, and its mappers run before this one.

```ts
import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
	testEnvironment: "jsdom",
	setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
	// Jest does not read tsconfig paths. Mirrors "@/*": ["./*"].
	moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
};

export default createJestConfig(config);
```

- [ ] **Step 2: Write the failing test**

Create `app/_lib/server/spaces.test.ts`. The Prisma client is mocked. The `mock` prefix on the handles lets `jest.mock` hoisting reference them. `Decimal` comes from Prisma's browser runtime, so the test never loads the real client.

```ts
/** @jest-environment node */
import { Decimal } from "@prisma/client/runtime/index-browser";

const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();

jest.mock("@/app/_lib/db", () => ({
	prisma: {
		space: {
			findMany: (...args: unknown[]) => mockFindMany(...args),
			findFirst: (...args: unknown[]) => mockFindFirst(...args),
		},
	},
}));

import {
	cardSelect,
	detailSelect,
	getPublishedSpaceBySlug,
	listPublishedSpaces,
	publishedWhere,
} from "@/app/_lib/server/spaces";

// DEMO rows, shaped like what Prisma returns for cardSelect / detailSelect.
const cardRow = {
	slug: "demo-poblacion-loft",
	title: "[DEMO] Corner loft with afternoon light",
	city: "MAKATI",
	areaName: "Poblacion",
	type: "APARTMENT",
	floorAreaSqm: 68,
	maxCrew: 12,
	naturalLight: "ABUNDANT",
	hourlyRate: 1800,
	halfDayRate: 7000,
	fullDayRate: 12000,
	minimumHours: 3,
	photos: [{ url: "https://example.invalid/demo-cover.jpg", alt: "Demo cover photo" }],
};

const detailRow = {
	...cardRow,
	description: "Upper-floor loft in a walk-up off the main strip.",
	setting: "INDOOR",
	rateNotes: "Illustrative rates.",
	ceilingHeightM: new Decimal("3.40"),
	windowDirection: "West-facing",
	powerOutlets: 14,
	powerAccess: "ON_SITE",
	blackoutCapable: true,
	noiseLevel: "MEDIUM",
	soundproofed: false,
	hasWifi: true,
	hasElevator: false,
	parkingSpaces: 1,
	restrooms: 1,
	loadInNotes: "Third floor, no lift.",
	accessNotes: "Host meets the crew at street level.",
	houseRules: "No smoke machines.",
	availabilityNotes: "Weekdays only.",
	tags: [{ slug: "large-windows", label: "Large windows" }],
	host: { displayName: "Demo Host A", about: "Placeholder host record.", respondsInHours: 12 },
	filmCredits: [
		{ title: "[DEMO] Short film", year: 2025, productionType: "FILM", sourceUrl: null },
	],
};

const PRIVATE_FIELDS = [
	"contactEmail",
	"contactPhone",
	"exactAddress",
	"latitude",
	"longitude",
	"barangay",
	"inquiries",
	"internalNote",
];

function keysDeep(value: unknown): string[] {
	if (value === null || typeof value !== "object") return [];
	return Object.entries(value).flatMap(([key, child]) => [key, ...keysDeep(child)]);
}

beforeEach(() => {
	mockFindMany.mockReset();
	mockFindFirst.mockReset();
});

describe("privacy", () => {
	it.each([
		["cardSelect", cardSelect],
		["detailSelect", detailSelect],
	])("%s selects no private field at any depth", (_name, select) => {
		const keys = keysDeep(select);
		for (const field of PRIVATE_FIELDS) {
			expect(keys).not.toContain(field);
		}
	});

	it("selects exactly the public host fields", () => {
		expect(Object.keys(detailSelect.host.select).sort()).toEqual([
			"about",
			"displayName",
			"respondsInHours",
		]);
	});

	it("does not pass through private fields even if a row carries them", async () => {
		mockFindFirst.mockResolvedValue({
			...detailRow,
			exactAddress: "[UNIT NO.] [BUILDING NAME], Polaris St, Poblacion, Makati City",
			latitude: new Decimal("14.565"),
			host: { ...detailRow.host, contactEmail: "demo-a@example.invalid", contactPhone: "0000" },
		});

		const space = await getPublishedSpaceBySlug("demo-poblacion-loft");
		const json = JSON.stringify(space);

		expect(json).not.toContain("demo-a@example.invalid");
		expect(json).not.toContain("Polaris St");
		expect(json).not.toContain("14.565");
		expect(json).not.toContain("0000");
	});
});

describe("publishedWhere", () => {
	it("requires a published space with a verified host", () => {
		expect(publishedWhere).toEqual({
			status: "PUBLISHED",
			host: { verifiedAt: { not: null } },
		});
	});
});

describe("listPublishedSpaces", () => {
	it("queries published spaces with the card select", async () => {
		mockFindMany.mockResolvedValue([]);

		await listPublishedSpaces();

		expect(mockFindMany).toHaveBeenCalledWith({
			where: publishedWhere,
			select: cardSelect,
			orderBy: [{ listedAt: { sort: "desc", nulls: "last" } }, { slug: "asc" }],
		});
	});

	it("maps a row to a SpaceCard", async () => {
		mockFindMany.mockResolvedValue([cardRow]);

		const [card] = await listPublishedSpaces();

		expect(card).toStrictEqual({
			slug: "demo-poblacion-loft",
			title: "[DEMO] Corner loft with afternoon light",
			city: "MAKATI",
			areaName: "Poblacion",
			type: "APARTMENT",
			coverPhoto: { url: "https://example.invalid/demo-cover.jpg", alt: "Demo cover photo" },
			rates: { hourly: 1800, halfDay: 7000, fullDay: 12000, minimumHours: 3 },
			floorAreaSqm: 68,
			maxCrew: 12,
			naturalLight: "ABUNDANT",
		});
	});

	it("gives a null cover photo when the space has no photos", async () => {
		mockFindMany.mockResolvedValue([{ ...cardRow, photos: [] }]);

		const [card] = await listPublishedSpaces();

		expect(card.coverPhoto).toBeNull();
	});
});

describe("getPublishedSpaceBySlug", () => {
	it("looks up the slug among published spaces only", async () => {
		mockFindFirst.mockResolvedValue(null);

		await getPublishedSpaceBySlug("demo-poblacion-loft");

		expect(mockFindFirst).toHaveBeenCalledWith({
			where: { ...publishedWhere, slug: "demo-poblacion-loft" },
			select: detailSelect,
		});
	});

	it("returns null when there is no published space with that slug", async () => {
		mockFindFirst.mockResolvedValue(null);

		await expect(getPublishedSpaceBySlug("does-not-exist")).resolves.toBeNull();
	});

	it("maps a row to a SpaceDetail, converting Decimal to number", async () => {
		mockFindFirst.mockResolvedValue(detailRow);

		const space = await getPublishedSpaceBySlug("demo-poblacion-loft");

		expect(space).toMatchObject({
			slug: "demo-poblacion-loft",
			ceilingHeightM: 3.4,
			host: { displayName: "Demo Host A", about: "Placeholder host record.", respondsInHours: 12 },
			tags: [{ slug: "large-windows", label: "Large windows" }],
			filmCredits: [
				{ title: "[DEMO] Short film", year: 2025, productionType: "FILM", sourceUrl: null },
			],
		});
		expect(space?.photos).toEqual([
			{ url: "https://example.invalid/demo-cover.jpg", alt: "Demo cover photo" },
		]);
	});

	it("keeps a missing ceiling height as null", async () => {
		mockFindFirst.mockResolvedValue({ ...detailRow, ceilingHeightM: null });

		const space = await getPublishedSpaceBySlug("demo-poblacion-loft");

		expect(space?.ceilingHeightM).toBeNull();
	});
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm test -- --runTestsByPath app/_lib/server/spaces.test.ts`
Expected: FAIL — `Could not locate module @/app/_lib/server/spaces` (the file doesn't exist yet).

- [ ] **Step 4: Implement**

Create `app/_lib/server/spaces.ts`:

```ts
// Public reads of Space. Every query here feeds a public page, so every relation
// is read with an explicit `select` — never `include`, and never `host: true`.
// Host contact details, exactAddress and coordinates are not selected at all.

import { cache } from "react";
import { prisma } from "@/app/_lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { PublicPhoto, SpaceCard, SpaceDetail } from "@/app/_lib/types";

// A space is public only when it is published AND a human has verified its host.
export const publishedWhere = {
	status: "PUBLISHED",
	host: { verifiedAt: { not: null } },
} satisfies Prisma.SpaceWhereInput;

// Cover photo first, then the host's order.
const photoOrder = [
	{ isCover: "desc" },
	{ sortOrder: "asc" },
] satisfies Prisma.PhotoOrderByWithRelationInput[];

export const cardSelect = {
	slug: true,
	title: true,
	city: true,
	areaName: true,
	type: true,
	floorAreaSqm: true,
	maxCrew: true,
	naturalLight: true,
	hourlyRate: true,
	halfDayRate: true,
	fullDayRate: true,
	minimumHours: true,
	photos: { select: { url: true, alt: true }, orderBy: photoOrder, take: 1 },
} satisfies Prisma.SpaceSelect;

export const detailSelect = {
	...cardSelect,
	photos: { select: { url: true, alt: true }, orderBy: photoOrder },
	description: true,
	setting: true,
	rateNotes: true,
	ceilingHeightM: true,
	windowDirection: true,
	powerOutlets: true,
	powerAccess: true,
	blackoutCapable: true,
	noiseLevel: true,
	soundproofed: true,
	hasWifi: true,
	hasElevator: true,
	parkingSpaces: true,
	restrooms: true,
	loadInNotes: true,
	accessNotes: true,
	houseRules: true,
	availabilityNotes: true,
	tags: { select: { slug: true, label: true }, orderBy: { label: "asc" } },
	host: { select: { displayName: true, about: true, respondsInHours: true } },
	filmCredits: {
		select: { title: true, year: true, productionType: true, sourceUrl: true },
		orderBy: [{ year: { sort: "desc", nulls: "last" } }, { title: "asc" }],
	},
} satisfies Prisma.SpaceSelect;

type CardRow = Prisma.SpaceGetPayload<{ select: typeof cardSelect }>;
type DetailRow = Prisma.SpaceGetPayload<{ select: typeof detailSelect }>;

// Mappers rebuild every object field by field. Spreading a row would carry
// along anything a future edit adds to the select.
function toPublicPhoto(photo: PublicPhoto): PublicPhoto {
	return { url: photo.url, alt: photo.alt };
}

export function toSpaceCard(row: CardRow): SpaceCard {
	const cover = row.photos.at(0);
	return {
		slug: row.slug,
		title: row.title,
		city: row.city,
		areaName: row.areaName,
		type: row.type,
		coverPhoto: cover ? toPublicPhoto(cover) : null,
		rates: {
			hourly: row.hourlyRate,
			halfDay: row.halfDayRate,
			fullDay: row.fullDayRate,
			minimumHours: row.minimumHours,
		},
		floorAreaSqm: row.floorAreaSqm,
		maxCrew: row.maxCrew,
		naturalLight: row.naturalLight,
	};
}

export function toSpaceDetail(row: DetailRow): SpaceDetail {
	return {
		...toSpaceCard(row),
		description: row.description,
		setting: row.setting,
		photos: row.photos.map(toPublicPhoto),
		tags: row.tags.map((tag) => ({ slug: tag.slug, label: tag.label })),
		host: {
			displayName: row.host.displayName,
			about: row.host.about,
			respondsInHours: row.host.respondsInHours,
		},
		rateNotes: row.rateNotes,
		ceilingHeightM: row.ceilingHeightM === null ? null : row.ceilingHeightM.toNumber(),
		windowDirection: row.windowDirection,
		powerOutlets: row.powerOutlets,
		powerAccess: row.powerAccess,
		blackoutCapable: row.blackoutCapable,
		noiseLevel: row.noiseLevel,
		soundproofed: row.soundproofed,
		hasWifi: row.hasWifi,
		hasElevator: row.hasElevator,
		parkingSpaces: row.parkingSpaces,
		restrooms: row.restrooms,
		loadInNotes: row.loadInNotes,
		accessNotes: row.accessNotes,
		houseRules: row.houseRules,
		availabilityNotes: row.availabilityNotes,
		filmCredits: row.filmCredits.map((credit) => ({
			title: credit.title,
			year: credit.year,
			productionType: credit.productionType,
			sourceUrl: credit.sourceUrl,
		})),
	};
}

export async function listPublishedSpaces(): Promise<SpaceCard[]> {
	const rows = await prisma.space.findMany({
		where: publishedWhere,
		select: cardSelect,
		orderBy: [{ listedAt: { sort: "desc", nulls: "last" } }, { slug: "asc" }],
	});
	return rows.map(toSpaceCard);
}

// cache() lets generateMetadata and the page share one query per request.
export const getPublishedSpaceBySlug = cache(
	async (slug: string): Promise<SpaceDetail | null> => {
		const row = await prisma.space.findFirst({
			where: { ...publishedWhere, slug },
			select: detailSelect,
		});
		return row ? toSpaceDetail(row) : null;
	},
);
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm test -- --runTestsByPath app/_lib/server/spaces.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Prove the privacy test bites**

Temporarily add `exactAddress: true,` to `cardSelect`, then re-run the test.
Expected: FAIL in `privacy › cardSelect selects no private field at any depth`. Remove the line, re-run, PASS.

- [ ] **Step 7: Gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all clean.

### ⛔ Checkpoint 1: reviewer, then stop for human commit

Suggested message: `feat(server): public space queries with explicit selects`

---

# Part 2 — Foundations (`frontend-dev`)

### Task 2: Styling foundations and the v16 layout entry

**Files:**
- Modify: `app/layout.tsx:1`
- Create: `app/_styles/_tokens.scss`
- Create: `app/_styles/message.module.scss`

**Interfaces:**
- Produces, in SCSS, via `@use "<relative path>/_styles/tokens" as *;`: `space($n)` → `calc(var(--mui-spacing) * n)`; `$radius-sm|md|lg`; `$color-ink`, `$color-ink-muted`, `$color-paper`, `$color-canvas`, `$color-hairline`, `$color-stamp`, `$color-verified`; `@mixin page` (route column layout). Fonts are used directly as `font: var(--mui-font-<variant>)`.
- Produces: `message.module.scss` classes `.screen` and `.link`, used by `error.tsx` (Task 4) and `not-found.tsx` (Task 10).

This task is configuration, not behaviour, so it has no unit test. It's verified by the build in Step 3 and by every later test that imports a module.

- [ ] **Step 1: Switch the MUI cache provider to its Next 16 entry**

In `app/layout.tsx`, change line 1 to:

```tsx
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
```

- [ ] **Step 2: Create the SCSS token bridge and the shared message styles**

Create `app/_styles/_tokens.scss`:

```scss
// SCSS access to design tokens. Values live in app/_lib/theme.ts only. MUI emits
// them as CSS custom properties (cssVariables: true), and this file just names
// the references. Never put a literal colour, gap, radius or font here.

// theme.spacing(n): 4px × n
@function space($n) {
	@return calc(var(--mui-spacing) * #{$n});
}

$radius-sm: var(--mui-radius-sm);
$radius-md: var(--mui-radius-md);
$radius-lg: var(--mui-radius-lg);

$color-ink: var(--mui-palette-text-primary);
$color-ink-muted: var(--mui-palette-text-secondary);
$color-paper: var(--mui-palette-background-paper);
$color-canvas: var(--mui-palette-background-default);
$color-hairline: var(--mui-palette-divider);
$color-stamp: var(--mui-palette-primary-main);
$color-verified: var(--mui-palette-verified-main);

// Page gutter and max width, shared by every route.
@mixin page {
	display: flex;
	flex-direction: column;
	gap: space(8);
	padding-block: space(10);
}
```

Create `app/_styles/message.module.scss`:

```scss
@use "./tokens" as *;

// Full-page message: error boundary, not-found.
.screen {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: space(4);
	padding-block: space(16);
}

.link a {
	color: $color-stamp;
}
```

- [ ] **Step 3: Verify**

Run: `pnpm build && pnpm typecheck && pnpm lint`
Expected: all succeed. (The SCSS partial compiles only once something imports it, which happens in Task 4. This step confirms the layout change.)

### Task 3: Labels, formatting and test support

**Files:**
- Create: `app/_components/labels.ts`
- Test: `app/_components/labels.test.ts`
- Create: `app/_components/testing.tsx`

**Interfaces:**
- Consumes: enum types and `IndicativeRates`, `SpaceCard`, `SpaceDetail` from `@/app/_lib/types`; `theme` from `@/app/_lib/theme`.
- Produces from `labels.ts`: `INDICATIVE_RATES_NOTE: string`; `cityLabels`, `spaceTypeLabels`, `settingLabels`, `naturalLightLabels`, `powerAccessLabels`, `levelLabels`, `productionTypeLabels` (each a full `Record<Enum, string>`); `formatPeso(amount: number): string`; `locationLine(areaName: string, city: City): string`; `type HeadlineRate = { amount: number; unit: "hour" | "half day" | "full day" }`; `headlineRate(rates: IndicativeRates): HeadlineRate | null`; `lightSummary(light: NaturalLight): string | null`.
- Produces from `testing.tsx`: `renderWithTheme(ui: ReactElement)`, which uses the real theme so custom variants map to the right elements (`displaySm` → `h2`); fixtures `demoCard: SpaceCard`, `demoDetail: SpaceDetail`, `demoPhoto: PublicPhoto`.

- [ ] **Step 1: Write the failing test**

Create `app/_components/labels.test.ts`:

```ts
import {
	cityLabels,
	formatPeso,
	headlineRate,
	lightSummary,
	locationLine,
	spaceTypeLabels,
} from "@/app/_components/labels";

describe("labels", () => {
	it("spells city names the way people write them", () => {
		expect(cityLabels.QUEZON_CITY).toBe("Quezon City");
		expect(cityLabels.LAS_PINAS).toBe("Las Piñas");
		expect(cityLabels.PARANAQUE).toBe("Parañaque");
		expect(cityLabels.PATEROS).toBe("Pateros");
	});

	it("labels space types for people, not databases", () => {
		expect(spaceTypeLabels.CAFE).toBe("Café");
		expect(spaceTypeLabels.EVENT_SPACE).toBe("Event space");
	});

	it("builds the public location from area and city only", () => {
		expect(locationLine("Poblacion", "MAKATI")).toBe("Poblacion, Makati");
	});
});

describe("formatPeso", () => {
	it("formats whole pesos with a peso sign and no centavos", () => {
		expect(formatPeso(1800)).toBe("₱1,800");
		expect(formatPeso(12000)).toBe("₱12,000");
	});
});

describe("headlineRate", () => {
	const none = { hourly: null, halfDay: null, fullDay: null, minimumHours: null };

	it("leads with the hourly rate", () => {
		expect(headlineRate({ ...none, hourly: 1800, halfDay: 7000 })).toEqual({
			amount: 1800,
			unit: "hour",
		});
	});

	it("falls back to half day, then full day", () => {
		expect(headlineRate({ ...none, halfDay: 7000, fullDay: 12000 })).toEqual({
			amount: 7000,
			unit: "half day",
		});
		expect(headlineRate({ ...none, fullDay: 12000 })).toEqual({ amount: 12000, unit: "full day" });
	});

	it("is null when the host gave no rate", () => {
		expect(headlineRate(none)).toBeNull();
	});
});

describe("lightSummary", () => {
	it("describes natural light, and says nothing when it is unknown", () => {
		expect(lightSummary("ABUNDANT")).toBe("Abundant light");
		expect(lightSummary("NONE")).toBe("No natural light");
		expect(lightSummary("UNKNOWN")).toBeNull();
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test -- --runTestsByPath app/_components/labels.test.ts`
Expected: FAIL — `Could not locate module @/app/_components/labels`.

- [ ] **Step 3: Implement**

Create `app/_components/labels.ts`. Both `minimumFractionDigits` and `maximumFractionDigits` are set, because some browsers throw a `RangeError` when only the maximum is lowered below PHP's default of 2.

```ts
// Display labels and formatting for public Space data. Every enum map is a
// full Record, so a new enum value in schema.prisma fails typecheck here until
// it has a label.

import type {
	City,
	IndicativeRates,
	Level,
	NaturalLight,
	PowerAccess,
	ProductionType,
	Setting,
	SpaceType,
} from "@/app/_lib/types";

export const INDICATIVE_RATES_NOTE =
	"Rates are indicative and agreed directly with the host. Iskawt takes no payment.";

export const cityLabels: Record<City, string> = {
	CALOOCAN: "Caloocan",
	LAS_PINAS: "Las Piñas",
	MAKATI: "Makati",
	MALABON: "Malabon",
	MANDALUYONG: "Mandaluyong",
	MANILA: "Manila",
	MARIKINA: "Marikina",
	MUNTINLUPA: "Muntinlupa",
	NAVOTAS: "Navotas",
	PARANAQUE: "Parañaque",
	PASAY: "Pasay",
	PASIG: "Pasig",
	PATEROS: "Pateros",
	QUEZON_CITY: "Quezon City",
	SAN_JUAN: "San Juan",
	TAGUIG: "Taguig",
	VALENZUELA: "Valenzuela",
};

export const spaceTypeLabels: Record<SpaceType, string> = {
	APARTMENT: "Apartment",
	HOUSE: "House",
	STUDIO: "Studio",
	OFFICE: "Office",
	COWORKING: "Co-working space",
	WAREHOUSE: "Warehouse",
	RETAIL: "Retail",
	CAFE: "Café",
	RESTAURANT: "Restaurant",
	BAR: "Bar",
	ROOFTOP: "Rooftop",
	GARDEN: "Garden",
	POOL: "Pool",
	EVENT_SPACE: "Event space",
	GYM: "Gym",
	OTHER: "Other",
};

export const settingLabels: Record<Setting, string> = {
	INDOOR: "Indoor",
	OUTDOOR: "Outdoor",
	BOTH: "Indoor and outdoor",
};

export const naturalLightLabels: Record<NaturalLight, string> = {
	ABUNDANT: "Abundant",
	MODERATE: "Moderate",
	MINIMAL: "Minimal",
	NONE: "None",
	UNKNOWN: "Not stated",
};

export const powerAccessLabels: Record<PowerAccess, string> = {
	ON_SITE: "On site",
	LIMITED: "Limited",
	GENERATOR_REQUIRED: "Generator required",
	UNKNOWN: "Not stated",
};

export const levelLabels: Record<Level, string> = {
	LOW: "Low",
	MEDIUM: "Medium",
	HIGH: "High",
};

export const productionTypeLabels: Record<ProductionType, string> = {
	FILM: "Film",
	TV: "TV",
	MUSIC_VIDEO: "Music video",
	COMMERCIAL: "Commercial",
	DOCUMENTARY: "Documentary",
	PHOTOSHOOT: "Photoshoot",
	EVENT: "Event",
};

const peso = new Intl.NumberFormat("en-PH", {
	style: "currency",
	currency: "PHP",
	minimumFractionDigits: 0,
	maximumFractionDigits: 0,
});

export function formatPeso(amount: number): string {
	return peso.format(amount);
}

// The public location of a space. Area and city only — never an address.
export function locationLine(areaName: string, city: City): string {
	return `${areaName}, ${cityLabels[city]}`;
}

export type HeadlineRate = { amount: number; unit: "hour" | "half day" | "full day" };

// The single rate a card leads with: hourly, else half day, else full day.
export function headlineRate(rates: IndicativeRates): HeadlineRate | null {
	if (rates.hourly !== null) return { amount: rates.hourly, unit: "hour" };
	if (rates.halfDay !== null) return { amount: rates.halfDay, unit: "half day" };
	if (rates.fullDay !== null) return { amount: rates.fullDay, unit: "full day" };
	return null;
}

export function lightSummary(light: NaturalLight): string | null {
	if (light === "UNKNOWN") return null;
	if (light === "NONE") return "No natural light";
	return `${naturalLightLabels[light]} light`;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test -- --runTestsByPath app/_components/labels.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Add test support**

Create `app/_components/testing.tsx`. Only tests import it.

```tsx
// Test support only — never imported by app code.
// Fixtures are DEMO data matching prisma/seed.ts. No real host or space.

import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import theme from "@/app/_lib/theme";
import type { SpaceCard, SpaceDetail } from "@/app/_lib/types";

export function renderWithTheme(ui: ReactElement) {
	return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

export const demoCard: SpaceCard = {
	slug: "demo-poblacion-loft",
	title: "[DEMO] Corner loft with afternoon light",
	city: "MAKATI",
	areaName: "Poblacion",
	type: "APARTMENT",
	coverPhoto: null,
	rates: { hourly: 1800, halfDay: 7000, fullDay: 12000, minimumHours: 3 },
	floorAreaSqm: 68,
	maxCrew: 12,
	naturalLight: "ABUNDANT",
};

export const demoDetail: SpaceDetail = {
	...demoCard,
	description:
		"Upper-floor loft in a walk-up off the main strip. Open plan, exposed ceiling, one long wall of windows facing west.",
	setting: "INDOOR",
	photos: [],
	tags: [
		{ slug: "large-windows", label: "Large windows" },
		{ slug: "wood-floors", label: "Wood floors" },
	],
	host: {
		displayName: "Demo Host A",
		about: "Placeholder host record.",
		respondsInHours: 12,
	},
	rateNotes: "Illustrative rates. Overtime and cleaning to be agreed with the host.",
	ceilingHeightM: 3.4,
	windowDirection: "West-facing",
	powerOutlets: 14,
	powerAccess: "ON_SITE",
	blackoutCapable: true,
	noiseLevel: "MEDIUM",
	soundproofed: false,
	hasWifi: true,
	hasElevator: false,
	parkingSpaces: 1,
	restrooms: 1,
	loadInNotes: "Third floor, no lift.",
	accessNotes: "Host meets the crew at street level.",
	houseRules: "No smoke machines. No open flame.",
	availabilityNotes: "Weekdays only. Nothing before 9am.",
	filmCredits: [],
};

export const demoPhoto = {
	url: "https://example.invalid/demo-cover.jpg",
	alt: "Demo photo placeholder",
};
```

### Task 4: App error boundary

**Files:**
- Create: `app/error.tsx`
- Test: `app/error.test.tsx`

**Interfaces:**
- Consumes: `renderWithTheme` (Task 3), `message.module.scss` (Task 2).
- Produces: the default export `ErrorPage({ error, retry })` that Next.js mounts for any uncaught error in a route segment.

- [ ] **Step 1: Write the failing test**

Create `app/error.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorPage from "@/app/error";
import { renderWithTheme } from "@/app/_components/testing";

describe("ErrorPage", () => {
	it("explains the failure without exposing the error", () => {
		renderWithTheme(<ErrorPage error={new Error("select contactEmail failed")} retry={jest.fn()} />);

		expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
		expect(screen.queryByText(/contactEmail/)).not.toBeInTheDocument();
	});

	it("retries when asked", async () => {
		const retry = jest.fn();
		renderWithTheme(<ErrorPage error={new Error("boom")} retry={retry} />);

		await userEvent.click(screen.getByRole("button", { name: "Try again" }));

		expect(retry).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test -- --runTestsByPath app/error.test.tsx`
Expected: FAIL — `Could not locate module @/app/error`.

- [ ] **Step 3: Implement**

Create `app/error.tsx`:

```tsx
"use client"; // error boundaries must be client components

import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import styles from "@/app/_styles/message.module.scss";

// Deliberately does not render or log `error`: in development its message can
// carry query details, and the server has already logged it.
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
	return (
		<Container component="main" maxWidth="sm" className={styles.screen}>
			<Typography variant="displayLg">Something went wrong</Typography>
			<Typography color="text.secondary">
				We couldn&apos;t load this page just now. The problem is on our side, not yours.
			</Typography>
			<Button variant="contained" onClick={() => retry()}>
				Try again
			</Button>
		</Container>
	);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test -- --runTestsByPath app/error.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all clean. The build is what compiles `_tokens.scss` for the first time: a Sass error here means a token name is wrong.

### ⛔ Checkpoint 2: reviewer, then stop for human commit

Suggested message: `feat(ui): styling foundations, labels, and error boundary`

---

# Part 3 — Space card (`frontend-dev`)

### Task 5: Photo frame and space card

**Files:**
- Create: `app/_components/PhotoFrame.tsx`, `app/_components/PhotoFrame.module.scss`
- Create: `app/_components/SpaceCard.tsx`, `app/_components/SpaceCard.module.scss`
- Test: `app/_components/SpaceCard.test.tsx`

**Interfaces:**
- Consumes: `formatPeso`, `headlineRate`, `lightSummary`, `locationLine`, `spaceTypeLabels` (Task 3); `demoCard`, `demoPhoto`, `renderWithTheme` (Task 3); tokens (Task 2).
- Produces: default export `PhotoFrame({ photo: PublicPhoto | null; sizes: string })`; default export `SpaceCard({ space: SpaceCard })`. Both are server components. The card is an `<article>` wrapping one link to `/spaces/<slug>`, whose accessible name includes the title.

- [ ] **Step 1: Write the failing test**

Create `app/_components/SpaceCard.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import SpaceCard from "@/app/_components/SpaceCard";
import { demoCard, demoPhoto, renderWithTheme } from "@/app/_components/testing";

describe("SpaceCard", () => {
	it("links the whole card to the listing page", () => {
		renderWithTheme(<SpaceCard space={demoCard} />);

		expect(screen.getByRole("link", { name: /Corner loft with afternoon light/ })).toHaveAttribute(
			"href",
			"/spaces/demo-poblacion-loft",
		);
	});

	it("titles the card with a heading", () => {
		renderWithTheme(<SpaceCard space={demoCard} />);

		expect(
			screen.getByRole("heading", { level: 2, name: "[DEMO] Corner loft with afternoon light" }),
		).toBeInTheDocument();
	});

	it("shows area, city and space type", () => {
		renderWithTheme(<SpaceCard space={demoCard} />);

		expect(screen.getByText("Poblacion, Makati · Apartment")).toBeInTheDocument();
	});

	it("marks the host as verified", () => {
		renderWithTheme(<SpaceCard space={demoCard} />);

		expect(screen.getByText("Verified host")).toBeInTheDocument();
	});

	it("leads with the hourly rate and its minimum", () => {
		renderWithTheme(<SpaceCard space={demoCard} />);

		expect(screen.getByText("₱1,800")).toBeInTheDocument();
		expect(screen.getByText(/\/hour · 3hr min/)).toBeInTheDocument();
	});

	it("falls back to the half-day rate when there is no hourly rate", () => {
		const space = { ...demoCard, rates: { ...demoCard.rates, hourly: null, minimumHours: null } };
		renderWithTheme(<SpaceCard space={space} />);

		expect(screen.getByText("₱7,000")).toBeInTheDocument();
		expect(screen.getByText(/\/half day/)).toBeInTheDocument();
	});

	it("says the rate is on inquiry when the host gave none", () => {
		const space = {
			...demoCard,
			rates: { hourly: null, halfDay: null, fullDay: null, minimumHours: null },
		};
		renderWithTheme(<SpaceCard space={space} />);

		expect(screen.getByText("Rate on inquiry")).toBeInTheDocument();
	});

	it("shows size, crew and light", () => {
		renderWithTheme(<SpaceCard space={demoCard} />);

		expect(screen.getByText("68 sqm · 12 crew · Abundant light")).toBeInTheDocument();
	});

	it("leaves out facts the host did not give", () => {
		const space = { ...demoCard, floorAreaSqm: null, naturalLight: "UNKNOWN" as const };
		renderWithTheme(<SpaceCard space={space} />);

		expect(screen.getByText("12 crew")).toBeInTheDocument();
	});

	it("shows a placeholder, not an invented photo, when there are no photos", () => {
		renderWithTheme(<SpaceCard space={demoCard} />);

		expect(screen.getByText("No photos yet")).toBeInTheDocument();
		expect(screen.queryByRole("img")).not.toBeInTheDocument();
	});

	it("shows the cover photo with its alt text", () => {
		renderWithTheme(<SpaceCard space={{ ...demoCard, coverPhoto: demoPhoto }} />);

		expect(screen.getByRole("img", { name: "Demo photo placeholder" })).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test -- --runTestsByPath app/_components/SpaceCard.test.tsx`
Expected: FAIL — `Could not locate module @/app/_components/SpaceCard`.

- [ ] **Step 3: Implement `PhotoFrame`**

Create `app/_components/PhotoFrame.module.scss`:

```scss
@use "../_styles/tokens" as *;

.frame {
	position: relative;
	width: 100%;
	aspect-ratio: 2 / 1;
	background: $color-canvas;

	img {
		object-fit: cover;
	}
}

.empty {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
}
```

Create `app/_components/PhotoFrame.tsx`:

```tsx
import Image from "next/image";
import Typography from "@mui/material/Typography";
import type { PublicPhoto } from "@/app/_lib/types";
import styles from "./PhotoFrame.module.scss";

// `unoptimized` until we decide where host photos are hosted — optimized
// next/image needs that origin listed in next.config.ts remotePatterns.
export default function PhotoFrame({ photo, sizes }: { photo: PublicPhoto | null; sizes: string }) {
	return (
		<div className={styles.frame}>
			{photo ? (
				<Image src={photo.url} alt={photo.alt} fill sizes={sizes} unoptimized />
			) : (
				<div className={styles.empty}>
					<Typography variant="label" color="text.secondary">
						No photos yet
					</Typography>
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 4: Implement `SpaceCard`**

Create `app/_components/SpaceCard.module.scss`. The theme's `MuiPaper` override already gives `Card` its hairline border and `radius-lg`, so the module only handles the link and layout.

```scss
@use "../_styles/tokens" as *;

.card {
	height: 100%;
	overflow: hidden;
}

// The whole card is one link. Reset link styling; show focus on the card itself.
.link {
	display: flex;
	flex-direction: column;
	height: 100%;
	color: inherit;
	text-decoration: none;

	&:focus-visible {
		outline: 2px solid $color-stamp;
		outline-offset: -2px;
		border-radius: $radius-lg;
	}

	&:hover .title {
		text-decoration: underline;
	}
}

.body {
	display: flex;
	flex-direction: column;
	gap: space(1);
	padding: space(4);
}

.verified {
	color: $color-verified;
}

.title {
	margin: 0;
}
```

Create `app/_components/SpaceCard.tsx`:

```tsx
import Link from "next/link";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import PhotoFrame from "@/app/_components/PhotoFrame";
import {
	formatPeso,
	headlineRate,
	lightSummary,
	locationLine,
	spaceTypeLabels,
} from "@/app/_components/labels";
import type { SpaceCard as SpaceCardData } from "@/app/_lib/types";
import styles from "./SpaceCard.module.scss";

export default function SpaceCard({ space }: { space: SpaceCardData }) {
	const rate = headlineRate(space.rates);
	const facts = [
		space.floorAreaSqm !== null ? `${space.floorAreaSqm} sqm` : null,
		space.maxCrew !== null ? `${space.maxCrew} crew` : null,
		lightSummary(space.naturalLight),
	].filter((fact): fact is string => fact !== null);

	return (
		<Card component="article" className={styles.card}>
			<Link href={`/spaces/${space.slug}`} className={styles.link}>
				<PhotoFrame photo={space.coverPhoto} sizes="(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw" />
				<div className={styles.body}>
					<Typography variant="label" className={styles.verified}>
						Verified host
					</Typography>
					<Typography variant="bodyStrong" component="h2" className={styles.title}>
						{space.title}
					</Typography>
					<Typography variant="caption" color="text.secondary">
						{locationLine(space.areaName, space.city)} · {spaceTypeLabels[space.type]}
					</Typography>
					{rate ? (
						<Typography variant="caption">
							<Typography component="span" variant="dataLg">
								{formatPeso(rate.amount)}
							</Typography>{" "}
							/{rate.unit}
							{space.rates.minimumHours !== null ? ` · ${space.rates.minimumHours}hr min` : ""}
						</Typography>
					) : (
						<Typography variant="caption" color="text.secondary">
							Rate on inquiry
						</Typography>
					)}
					{facts.length > 0 && (
						<Typography variant="data" component="p" color="text.secondary">
							{facts.join(" · ")}
						</Typography>
					)}
				</div>
			</Link>
		</Card>
	);
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm test -- --runTestsByPath app/_components/SpaceCard.test.tsx`
Expected: PASS, 11 tests.

- [ ] **Step 6: Gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all clean.

### ⛔ Checkpoint 3: reviewer, then stop for human commit

Suggested message: `feat(ui): space card`

---

# Part 4 — Browse `/` (`frontend-dev`)

### Task 6: Browse results

**Files:**
- Create: `app/_components/BrowseResults.tsx`, `app/_components/BrowseResults.module.scss`
- Test: `app/_components/BrowseResults.test.tsx`

**Interfaces:**
- Consumes: `SpaceCard` (Task 5), `demoCard`, `renderWithTheme`.
- Produces: default export `BrowseResults({ spaces: SpaceCard[] })`. It renders a counted `<ul>` of cards, or the empty state (an `h2` reading "No spaces listed yet") when there are none.

- [ ] **Step 1: Write the failing test**

Create `app/_components/BrowseResults.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import BrowseResults from "@/app/_components/BrowseResults";
import { demoCard, renderWithTheme } from "@/app/_components/testing";

const second = { ...demoCard, slug: "demo-kapitolyo-rowhouse", title: "[DEMO] Two-storey rowhouse" };

describe("BrowseResults", () => {
	it("renders one list item per space", () => {
		renderWithTheme(<BrowseResults spaces={[demoCard, second]} />);

		const list = screen.getByRole("list");
		expect(within(list).getAllByRole("listitem")).toHaveLength(2);
	});

	it("counts the spaces", () => {
		renderWithTheme(<BrowseResults spaces={[demoCard, second]} />);

		expect(screen.getByText("2 spaces")).toBeInTheDocument();
	});

	it("uses the singular for one space", () => {
		renderWithTheme(<BrowseResults spaces={[demoCard]} />);

		expect(screen.getByText("1 space")).toBeInTheDocument();
	});

	it("shows an empty state instead of an empty grid", () => {
		renderWithTheme(<BrowseResults spaces={[]} />);

		expect(screen.getByRole("heading", { name: "No spaces listed yet" })).toBeInTheDocument();
		expect(screen.queryByRole("list")).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test -- --runTestsByPath app/_components/BrowseResults.test.tsx`
Expected: FAIL — `Could not locate module @/app/_components/BrowseResults`.

- [ ] **Step 3: Implement**

Create `app/_components/BrowseResults.module.scss`:

```scss
@use "../_styles/tokens" as *;

.results {
	display: flex;
	flex-direction: column;
	gap: space(4);
}

// Columns fill by available width, so no breakpoint values are needed here.
.grid {
	list-style: none;
	margin: 0;
	padding: 0;
	display: grid;
	gap: space(6);
	grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
}

.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: space(2);
	padding-block: space(12);
	text-align: center;
}
```

Create `app/_components/BrowseResults.tsx`:

```tsx
import Typography from "@mui/material/Typography";
import SpaceCard from "@/app/_components/SpaceCard";
import type { SpaceCard as SpaceCardData } from "@/app/_lib/types";
import styles from "./BrowseResults.module.scss";

export default function BrowseResults({ spaces }: { spaces: SpaceCardData[] }) {
	if (spaces.length === 0) {
		return (
			<section className={styles.empty}>
				<Typography variant="displaySm">No spaces listed yet</Typography>
				<Typography color="text.secondary">
					Every host is verified by a person before their space appears here. Check back soon.
				</Typography>
			</section>
		);
	}

	return (
		<section aria-label="Spaces" className={styles.results}>
			<Typography variant="caption" color="text.secondary">
				{spaces.length === 1 ? "1 space" : `${spaces.length} spaces`}
			</Typography>
			<ul className={styles.grid}>
				{spaces.map((space) => (
					<li key={space.slug}>
						<SpaceCard space={space} />
					</li>
				))}
			</ul>
		</section>
	);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test -- --runTestsByPath app/_components/BrowseResults.test.tsx`
Expected: PASS, 4 tests.

### Task 7: Browse route

**Files:**
- Delete: `app/page.tsx`, `app/page.module.css` (create-next-app boilerplate)
- Create: `app/(browse)/page.tsx`, `app/(browse)/page.module.scss`, `app/(browse)/loading.tsx`
- Test: `app/(browse)/page.test.tsx`

**Interfaces:**
- Consumes: `listPublishedSpaces` (Task 1), `BrowseResults` (Task 6), `INDICATIVE_RATES_NOTE` (Task 3), `@mixin page` (Task 2).
- Produces: the `/` route. `(browse)` is a route group, so it adds nothing to the URL. It exists only so `loading.tsx` covers browse and not the detail page.

- [ ] **Step 1: Write the failing test**

Create `app/(browse)/page.test.tsx`. The page is an async server component, so the test awaits it and renders the JSX it returns. `next/server`'s `connection()` and the query module are mocked.

```tsx
import { screen } from "@testing-library/react";
import BrowsePage from "@/app/(browse)/page";
import { listPublishedSpaces } from "@/app/_lib/server/spaces";
import { demoCard, renderWithTheme } from "@/app/_components/testing";

jest.mock("next/server", () => ({ connection: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/app/_lib/server/spaces", () => ({ listPublishedSpaces: jest.fn() }));

const mockList = jest.mocked(listPublishedSpaces);

describe("BrowsePage", () => {
	it("lists published spaces under the page heading", async () => {
		mockList.mockResolvedValue([demoCard]);

		renderWithTheme(await BrowsePage());

		expect(
			screen.getByRole("heading", { level: 1, name: "Shoot spaces in Metro Manila" }),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /Corner loft/ })).toBeInTheDocument();
	});

	it("says rates are indicative", async () => {
		mockList.mockResolvedValue([demoCard]);

		renderWithTheme(await BrowsePage());

		expect(screen.getByText(/Rates are indicative/)).toBeInTheDocument();
	});

	it("shows the empty state when nothing is published", async () => {
		mockList.mockResolvedValue([]);

		renderWithTheme(await BrowsePage());

		expect(screen.getByRole("heading", { name: "No spaces listed yet" })).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test -- --runTestsByPath "app/(browse)/page.test.tsx"`
Expected: FAIL — `Could not locate module @/app/(browse)/page`.

- [ ] **Step 3: Remove the boilerplate**

```bash
rm app/page.tsx app/page.module.css
```

- [ ] **Step 4: Implement the page, its styles, and the loading state**

Create `app/(browse)/page.module.scss`. `loading.tsx` shares it.

```scss
@use "../_styles/tokens" as *;

.page {
	@include page;
}

.header {
	display: flex;
	flex-direction: column;
	gap: space(2);
}

// loading.tsx
.skeletonTitle {
	width: 60%;
	font: var(--mui-font-displayLg);
}

.skeletonGrid {
	display: grid;
	gap: space(6);
	grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
}

.skeletonCard {
	height: auto;
	aspect-ratio: 4 / 3;
}
```

Create `app/(browse)/page.tsx`. `connection()` keeps `/` out of build-time prerendering. Without it, `next build` would bake in whatever the database held at build time.

```tsx
import type { Metadata } from "next";
import { connection } from "next/server";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import BrowseResults from "@/app/_components/BrowseResults";
import { INDICATIVE_RATES_NOTE } from "@/app/_components/labels";
import { listPublishedSpaces } from "@/app/_lib/server/spaces";
import styles from "./page.module.scss";

export const metadata: Metadata = {
	title: "Iskawt — shoot spaces in Metro Manila",
	description: "Private spaces across Metro Manila for film and photo shoots.",
};

export default async function BrowsePage() {
	// Listings change without a deploy, so never prerender this page at build time.
	await connection();
	const spaces = await listPublishedSpaces();

	return (
		<Container component="main" maxWidth="lg" className={styles.page}>
			<header className={styles.header}>
				<Typography variant="displayLg">Shoot spaces in Metro Manila</Typography>
				<Typography color="text.secondary">{INDICATIVE_RATES_NOTE}</Typography>
			</header>
			<BrowseResults spaces={spaces} />
		</Container>
	);
}
```

Create `app/(browse)/loading.tsx`. It's static markup, covered by typecheck, lint and the build.

```tsx
import Container from "@mui/material/Container";
import Skeleton from "@mui/material/Skeleton";
import styles from "./page.module.scss";

export default function Loading() {
	return (
		<Container component="main" maxWidth="lg" aria-busy="true" aria-label="Loading" className={styles.page}>
			<Skeleton variant="text" className={styles.skeletonTitle} />
			<div className={styles.skeletonGrid}>
				{[0, 1, 2].map((key) => (
					<Skeleton key={key} variant="rounded" className={styles.skeletonCard} />
				))}
			</div>
		</Container>
	);
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm test -- --runTestsByPath "app/(browse)/page.test.tsx"`
Expected: PASS, 3 tests.

- [ ] **Step 6: Gate**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
Expected: all clean; the build route table shows `ƒ /`. Build first, so typecheck sees fresh route types after the move out of `app/page.tsx`.

### ⛔ Checkpoint 4: reviewer, then stop for human commit

Suggested message: `feat(browse): published spaces on the home page`

---

# Part 5 — Detail components (`frontend-dev`)

### Task 8: Rate panel

**Files:**
- Create: `app/_components/RatePanel.tsx`, `app/_components/RatePanel.module.scss`
- Test: `app/_components/RatePanel.test.tsx`

**Interfaces:**
- Consumes: `formatPeso`, `INDICATIVE_RATES_NOTE`; `IndicativeRates`, `PublicHost`; `demoDetail`.
- Produces: default export `RatePanel({ rates: IndicativeRates; rateNotes: string | null; host: PublicHost })`. It renders an `<aside aria-label="Rates and host">`.

- [ ] **Step 1: Write the failing test**

Create `app/_components/RatePanel.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import RatePanel from "@/app/_components/RatePanel";
import { demoDetail, renderWithTheme } from "@/app/_components/testing";

const { rates, rateNotes, host } = demoDetail;

describe("RatePanel", () => {
	it("lists each rate the host gave", () => {
		renderWithTheme(<RatePanel rates={rates} rateNotes={rateNotes} host={host} />);

		expect(screen.getByText("Per hour")).toBeInTheDocument();
		expect(screen.getByText("₱1,800")).toBeInTheDocument();
		expect(screen.getByText("Half day")).toBeInTheDocument();
		expect(screen.getByText("₱7,000")).toBeInTheDocument();
		expect(screen.getByText("Full day")).toBeInTheDocument();
		expect(screen.getByText("₱12,000")).toBeInTheDocument();
	});

	it("leaves out rates the host did not give", () => {
		renderWithTheme(<RatePanel rates={{ ...rates, halfDay: null }} rateNotes={rateNotes} host={host} />);

		expect(screen.queryByText("Half day")).not.toBeInTheDocument();
	});

	it("says the rate is on inquiry when there are none", () => {
		const none = { hourly: null, halfDay: null, fullDay: null, minimumHours: null };
		renderWithTheme(<RatePanel rates={none} rateNotes={null} host={host} />);

		expect(screen.getByText("Rate on inquiry")).toBeInTheDocument();
	});

	it("shows the minimum booking and the host's rate notes", () => {
		renderWithTheme(<RatePanel rates={rates} rateNotes={rateNotes} host={host} />);

		expect(screen.getByText("Minimum 3 hours")).toBeInTheDocument();
		expect(screen.getByText(/Overtime and cleaning to be agreed/)).toBeInTheDocument();
	});

	it("always says rates are indicative", () => {
		renderWithTheme(<RatePanel rates={rates} rateNotes={null} host={host} />);

		expect(screen.getByText(/Rates are indicative/)).toBeInTheDocument();
	});

	it("introduces the host by display name only", () => {
		renderWithTheme(<RatePanel rates={rates} rateNotes={rateNotes} host={host} />);

		expect(screen.getByText("Hosted by Demo Host A")).toBeInTheDocument();
		expect(screen.getByText("Verified host")).toBeInTheDocument();
		expect(screen.getByText("Usually replies within 12 hours.")).toBeInTheDocument();
	});

	it("uses the singular for a one-hour reply time", () => {
		renderWithTheme(<RatePanel rates={rates} rateNotes={null} host={{ ...host, respondsInHours: 1 }} />);

		expect(screen.getByText("Usually replies within 1 hour.")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test -- --runTestsByPath app/_components/RatePanel.test.tsx`
Expected: FAIL — `Could not locate module @/app/_components/RatePanel`.

- [ ] **Step 3: Implement**

Create `app/_components/RatePanel.module.scss`:

```scss
@use "../_styles/tokens" as *;

.panel {
	display: flex;
	flex-direction: column;
	gap: space(4);
	padding: space(6);
}

.group {
	display: flex;
	flex-direction: column;
	gap: space(2);
}

.host {
	display: flex;
	flex-direction: column;
	gap: space(1);
}

.rates {
	margin: 0;
	display: grid;
	grid-template-columns: auto 1fr;
	column-gap: space(4);
	row-gap: space(1);
}

.amount {
	margin: 0;
}

.verified {
	color: $color-verified;
}
```

Create `app/_components/RatePanel.tsx`:

```tsx
import { Fragment } from "react";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { INDICATIVE_RATES_NOTE, formatPeso } from "@/app/_components/labels";
import type { IndicativeRates, PublicHost } from "@/app/_lib/types";
import styles from "./RatePanel.module.scss";

type Props = { rates: IndicativeRates; rateNotes: string | null; host: PublicHost };

export default function RatePanel({ rates, rateNotes, host }: Props) {
	const rows = [
		{ term: "Per hour", amount: rates.hourly },
		{ term: "Half day", amount: rates.halfDay },
		{ term: "Full day", amount: rates.fullDay },
	].filter((row): row is { term: string; amount: number } => row.amount !== null);

	return (
		<Paper component="aside" aria-label="Rates and host" className={styles.panel}>
			<div className={styles.group}>
				<Typography variant="label" component="h2">
					Indicative rates
				</Typography>
				{rows.length > 0 ? (
					<dl className={styles.rates}>
						{rows.map((row) => (
							<Fragment key={row.term}>
								<Typography component="dt" color="text.secondary">
									{row.term}
								</Typography>
								<Typography component="dd" variant="dataLg" className={styles.amount}>
									{formatPeso(row.amount)}
								</Typography>
							</Fragment>
						))}
					</dl>
				) : (
					<Typography>Rate on inquiry</Typography>
				)}
				{rates.minimumHours !== null && (
					<Typography variant="caption">
						Minimum {rates.minimumHours} {rates.minimumHours === 1 ? "hour" : "hours"}
					</Typography>
				)}
				{rateNotes && <Typography variant="caption">{rateNotes}</Typography>}
				<Typography variant="caption" color="text.secondary">
					{INDICATIVE_RATES_NOTE}
				</Typography>
			</div>
			<Divider />
			<div className={styles.host}>
				<Typography variant="bodyStrong">Hosted by {host.displayName}</Typography>
				<Typography variant="label" className={styles.verified}>
					Verified host
				</Typography>
				{host.respondsInHours !== null && (
					<Typography variant="caption" color="text.secondary">
						Usually replies within {host.respondsInHours} {host.respondsInHours === 1 ? "hour" : "hours"}.
					</Typography>
				)}
				{host.about && <Typography variant="caption">{host.about}</Typography>}
			</div>
		</Paper>
	);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test -- --runTestsByPath app/_components/RatePanel.test.tsx`
Expected: PASS, 7 tests.

### Task 9: Space facts

**Files:**
- Create: `app/_components/SpaceFacts.tsx`, `app/_components/SpaceFacts.module.scss`
- Test: `app/_components/SpaceFacts.test.tsx`

**Interfaces:**
- Consumes: `levelLabels`, `naturalLightLabels`, `powerAccessLabels`, `productionTypeLabels`; `SpaceDetail`; `demoDetail`.
- Produces: default export `SpaceFacts({ space: SpaceDetail })`. It renders the sections "Specs" (always), "Getting in" (only if any notes exist) and "Shot here" (only if credits exist), each headed by an `h2`. The `dt`/`dd` pairs are direct children of `<dl>` (via `Fragment`), so the markup stays valid.

- [ ] **Step 1: Write the failing test**

Create `app/_components/SpaceFacts.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import SpaceFacts from "@/app/_components/SpaceFacts";
import { demoDetail, renderWithTheme } from "@/app/_components/testing";

function detailFor(term: string) {
	return screen.getByText(term).nextElementSibling?.textContent;
}

describe("SpaceFacts", () => {
	it("lists the practical specs a production needs", () => {
		renderWithTheme(<SpaceFacts space={demoDetail} />);

		expect(screen.getByRole("heading", { name: "Specs" })).toBeInTheDocument();
		expect(detailFor("Floor area")).toBe("68 sqm");
		expect(detailFor("Ceiling height")).toBe("3.40 m");
		expect(detailFor("Max crew")).toBe("12");
		expect(detailFor("Natural light")).toBe("Abundant");
		expect(detailFor("Power access")).toBe("On site");
		expect(detailFor("Noise level")).toBe("Medium");
		expect(detailFor("Parking")).toBe("1 slot");
		expect(detailFor("Blackout")).toBe("Yes");
		expect(detailFor("Elevator")).toBe("No");
	});

	it("leaves out specs the host did not give", () => {
		const space = { ...demoDetail, ceilingHeightM: null, naturalLight: "UNKNOWN" as const, noiseLevel: null };
		renderWithTheme(<SpaceFacts space={space} />);

		expect(screen.queryByText("Ceiling height")).not.toBeInTheDocument();
		expect(screen.queryByText("Natural light")).not.toBeInTheDocument();
		expect(screen.queryByText("Noise level")).not.toBeInTheDocument();
	});

	it("shows load-in, access, house rules and availability", () => {
		renderWithTheme(<SpaceFacts space={demoDetail} />);

		expect(screen.getByRole("heading", { name: "Getting in" })).toBeInTheDocument();
		expect(detailFor("Load-in")).toBe("Third floor, no lift.");
		expect(detailFor("House rules")).toBe("No smoke machines. No open flame.");
		expect(detailFor("Availability")).toBe("Weekdays only. Nothing before 9am.");
	});

	it("drops the Getting in section when the host gave no notes", () => {
		const space = { ...demoDetail, loadInNotes: null, accessNotes: null, houseRules: null, availabilityNotes: null };
		renderWithTheme(<SpaceFacts space={space} />);

		expect(screen.queryByRole("heading", { name: "Getting in" })).not.toBeInTheDocument();
	});

	it("lists film credits, linking the ones with a source", () => {
		const space = {
			...demoDetail,
			filmCredits: [
				{ title: "[DEMO] Short film", year: 2025, productionType: "FILM" as const, sourceUrl: "https://example.invalid/credit" },
				{ title: "[DEMO] Music video", year: null, productionType: "MUSIC_VIDEO" as const, sourceUrl: null },
			],
		};
		renderWithTheme(<SpaceFacts space={space} />);

		expect(screen.getByRole("heading", { name: "Shot here" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "[DEMO] Short film (2025)" })).toHaveAttribute(
			"href",
			"https://example.invalid/credit",
		);
		expect(screen.getByText(/\[DEMO\] Music video/)).toBeInTheDocument();
	});

	it("drops the Shot here section when there are no credits", () => {
		renderWithTheme(<SpaceFacts space={demoDetail} />);

		expect(screen.queryByRole("heading", { name: "Shot here" })).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test -- --runTestsByPath app/_components/SpaceFacts.test.tsx`
Expected: FAIL — `Could not locate module @/app/_components/SpaceFacts`.

- [ ] **Step 3: Implement**

Create `app/_components/SpaceFacts.module.scss`:

```scss
@use "../_styles/tokens" as *;

.section {
	display: flex;
	flex-direction: column;
	gap: space(4);
}

// Term above detail on narrow screens, side by side once there is room.
.facts {
	margin: 0;
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), max-content) minmax(min(100%, 200px), 1fr));
	column-gap: space(6);
	row-gap: space(2);
}

.detail {
	margin: 0;
}

.credits {
	margin: 0;
	padding-inline-start: space(5);
}
```

Create `app/_components/SpaceFacts.tsx`. Film-credit links are external, so they use MUI `Link` with a plain `href`.

```tsx
import { Fragment, type ReactNode } from "react";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import {
	levelLabels,
	naturalLightLabels,
	powerAccessLabels,
	productionTypeLabels,
} from "@/app/_components/labels";
import type { SpaceDetail } from "@/app/_lib/types";
import styles from "./SpaceFacts.module.scss";

type Row = { term: string; detail: string };

const yesNo = (value: boolean) => (value ? "Yes" : "No");

// Builds rows from what the host gave; anything unknown is left out, not shown as blank.
function specRows(space: SpaceDetail): Row[] {
	const rows: (Row | null)[] = [
		space.floorAreaSqm !== null ? { term: "Floor area", detail: `${space.floorAreaSqm} sqm` } : null,
		space.ceilingHeightM !== null ? { term: "Ceiling height", detail: `${space.ceilingHeightM.toFixed(2)} m` } : null,
		space.maxCrew !== null ? { term: "Max crew", detail: String(space.maxCrew) } : null,
		space.naturalLight !== "UNKNOWN" ? { term: "Natural light", detail: naturalLightLabels[space.naturalLight] } : null,
		space.windowDirection !== null ? { term: "Window direction", detail: space.windowDirection } : null,
		{ term: "Blackout", detail: yesNo(space.blackoutCapable) },
		space.powerOutlets !== null ? { term: "Outlets", detail: String(space.powerOutlets) } : null,
		space.powerAccess !== "UNKNOWN" ? { term: "Power access", detail: powerAccessLabels[space.powerAccess] } : null,
		space.noiseLevel !== null ? { term: "Noise level", detail: levelLabels[space.noiseLevel] } : null,
		{ term: "Soundproofed", detail: yesNo(space.soundproofed) },
		space.parkingSpaces !== null
			? { term: "Parking", detail: space.parkingSpaces === 1 ? "1 slot" : `${space.parkingSpaces} slots` }
			: null,
		space.restrooms !== null ? { term: "Restrooms", detail: String(space.restrooms) } : null,
		{ term: "Wi-Fi", detail: yesNo(space.hasWifi) },
		{ term: "Elevator", detail: yesNo(space.hasElevator) },
	];
	return rows.filter((row): row is Row => row !== null);
}

function accessRows(space: SpaceDetail): Row[] {
	const rows: (Row | null)[] = [
		space.loadInNotes !== null ? { term: "Load-in", detail: space.loadInNotes } : null,
		space.accessNotes !== null ? { term: "Access", detail: space.accessNotes } : null,
		space.houseRules !== null ? { term: "House rules", detail: space.houseRules } : null,
		space.availabilityNotes !== null ? { term: "Availability", detail: space.availabilityNotes } : null,
	];
	return rows.filter((row): row is Row => row !== null);
}

function FactList({ rows }: { rows: Row[] }) {
	return (
		<dl className={styles.facts}>
			{rows.map((row) => (
				<Fragment key={row.term}>
					<Typography component="dt" variant="label" color="text.secondary">
						{row.term}
					</Typography>
					<Typography component="dd" className={styles.detail}>
						{row.detail}
					</Typography>
				</Fragment>
			))}
		</dl>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className={styles.section}>
			<Typography variant="displaySm">{title}</Typography>
			{children}
		</section>
	);
}

export default function SpaceFacts({ space }: { space: SpaceDetail }) {
	const access = accessRows(space);

	return (
		<>
			<Section title="Specs">
				<FactList rows={specRows(space)} />
			</Section>
			{access.length > 0 && (
				<Section title="Getting in">
					<FactList rows={access} />
				</Section>
			)}
			{space.filmCredits.length > 0 && (
				<Section title="Shot here">
					<ul className={styles.credits}>
						{space.filmCredits.map((credit) => {
							const label = `${credit.title}${credit.year !== null ? ` (${credit.year})` : ""}`;
							return (
								<Typography component="li" key={`${credit.title}-${credit.year}`}>
									{credit.sourceUrl ? (
										<Link href={credit.sourceUrl} rel="noopener noreferrer" target="_blank">
											{label}
										</Link>
									) : (
										label
									)}{" "}
									· {productionTypeLabels[credit.productionType]}
								</Typography>
							);
						})}
					</ul>
				</Section>
			)}
		</>
	);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test -- --runTestsByPath app/_components/SpaceFacts.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all clean.

### ⛔ Checkpoint 5: reviewer, then stop for human commit

Suggested message: `feat(ui): rate panel and space facts`

---

# Part 6 — Detail route `/spaces/[slug]` (`frontend-dev`)

### Task 10: Detail route and not-found

**Files:**
- Create: `app/spaces/[slug]/page.tsx`, `app/spaces/[slug]/page.module.scss`, `app/spaces/[slug]/not-found.tsx`
- Test: `app/spaces/[slug]/page.test.tsx`

**Interfaces:**
- Consumes: `getPublishedSpaceBySlug` (Task 1), `PhotoFrame` (Task 5), `RatePanel` (Task 8), `SpaceFacts` (Task 9), `locationLine`, `settingLabels`, `spaceTypeLabels`, `message.module.scss` (Task 2).
- Produces: the `/spaces/[slug]` route, `generateMetadata`, and a real 404 for unknown or unpublished slugs. In Next 16 `params` is a `Promise` and must be awaited.

- [ ] **Step 1: Write the failing test**

Create `app/spaces/[slug]/page.test.tsx`. `notFound` is mocked to throw, mirroring how Next.js aborts rendering.

```tsx
import { screen, within } from "@testing-library/react";
import SpacePage, { generateMetadata } from "@/app/spaces/[slug]/page";
import { getPublishedSpaceBySlug } from "@/app/_lib/server/spaces";
import { demoDetail, demoPhoto, renderWithTheme } from "@/app/_components/testing";

jest.mock("@/app/_lib/server/spaces", () => ({ getPublishedSpaceBySlug: jest.fn() }));
jest.mock("next/navigation", () => ({
	notFound: jest.fn(() => {
		throw new Error("NEXT_NOT_FOUND");
	}),
}));

const mockGet = jest.mocked(getPublishedSpaceBySlug);
const params = Promise.resolve({ slug: "demo-poblacion-loft" });

describe("SpacePage", () => {
	it("looks the space up by the slug in the URL", async () => {
		mockGet.mockResolvedValue(demoDetail);

		renderWithTheme(await SpacePage({ params }));

		expect(mockGet).toHaveBeenCalledWith("demo-poblacion-loft");
	});

	it("titles the page with the space and its public location", async () => {
		mockGet.mockResolvedValue(demoDetail);

		renderWithTheme(await SpacePage({ params }));

		expect(
			screen.getByRole("heading", { level: 1, name: "[DEMO] Corner loft with afternoon light" }),
		).toBeInTheDocument();
		expect(screen.getByText("Poblacion, Makati · Apartment · Indoor")).toBeInTheDocument();
	});

	it("shows area and city under Where, and says the address comes from the host", async () => {
		mockGet.mockResolvedValue(demoDetail);

		renderWithTheme(await SpacePage({ params }));

		const where = screen.getByRole("heading", { name: "Where" }).closest("section");
		expect(where).not.toBeNull();
		if (!where) return;
		expect(within(where).getByText("Poblacion, Makati")).toBeInTheDocument();
		expect(within(where).getByText(/shares the full address once they accept/)).toBeInTheDocument();
	});

	it("shows description, tags, specs and rates", async () => {
		mockGet.mockResolvedValue(demoDetail);

		renderWithTheme(await SpacePage({ params }));

		expect(screen.getByText(/Upper-floor loft in a walk-up/)).toBeInTheDocument();
		expect(screen.getByText("Large windows")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Specs" })).toBeInTheDocument();
		expect(screen.getByRole("complementary", { name: "Rates and host" })).toBeInTheDocument();
	});

	it("shows every photo when the space has them", async () => {
		const second = { url: "https://example.invalid/demo-2.jpg", alt: "Second demo photo" };
		mockGet.mockResolvedValue({ ...demoDetail, photos: [demoPhoto, second] });

		renderWithTheme(await SpacePage({ params }));

		expect(screen.getByRole("img", { name: "Demo photo placeholder" })).toBeInTheDocument();
		expect(screen.getByRole("img", { name: "Second demo photo" })).toBeInTheDocument();
	});

	it("links back to browse", async () => {
		mockGet.mockResolvedValue(demoDetail);

		renderWithTheme(await SpacePage({ params }));

		expect(screen.getByRole("link", { name: "All spaces" })).toHaveAttribute("href", "/");
	});

	it("is a 404 when no published space has the slug", async () => {
		mockGet.mockResolvedValue(null);

		await expect(SpacePage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
	});
});

describe("generateMetadata", () => {
	it("uses the space title", async () => {
		mockGet.mockResolvedValue(demoDetail);

		await expect(generateMetadata({ params })).resolves.toEqual({
			title: "[DEMO] Corner loft with afternoon light — Iskawt",
		});
	});

	it("does not reveal whether an unpublished slug exists", async () => {
		mockGet.mockResolvedValue(null);

		await expect(generateMetadata({ params })).resolves.toEqual({ title: "Space not found — Iskawt" });
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test -- --runTestsByPath "app/spaces/[slug]/page.test.tsx"`
Expected: FAIL — `Could not locate module @/app/spaces/[slug]/page`.

- [ ] **Step 3: Implement the page**

Create `app/spaces/[slug]/page.module.scss`:

```scss
@use "../../_styles/tokens" as *;

.page {
	@include page;
}

.crumb a {
	color: inherit;
}

.header,
.where {
	display: flex;
	flex-direction: column;
	gap: space(2);
}

.gallery {
	display: grid;
	gap: space(2);
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
	border-radius: $radius-lg;
	overflow: hidden;
}

// Main column and rate panel side by side when there is room, stacked otherwise.
.columns {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	gap: space(10);
}

.main {
	flex: 2 1 480px;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: space(8);
}

.aside {
	flex: 1 1 280px;
}

.about {
	display: flex;
	flex-direction: column;
	gap: space(4);
}

.tags {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-wrap: wrap;
	gap: space(2);
}
```

Create `app/spaces/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import PhotoFrame from "@/app/_components/PhotoFrame";
import RatePanel from "@/app/_components/RatePanel";
import SpaceFacts from "@/app/_components/SpaceFacts";
import { locationLine, settingLabels, spaceTypeLabels } from "@/app/_components/labels";
import { getPublishedSpaceBySlug } from "@/app/_lib/server/spaces";
import styles from "./page.module.scss";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const space = await getPublishedSpaceBySlug(slug);
	return { title: space ? `${space.title} — Iskawt` : "Space not found — Iskawt" };
}

export default async function SpacePage({ params }: Props) {
	const { slug } = await params;
	const space = await getPublishedSpaceBySlug(slug);
	if (!space) notFound();

	const location = locationLine(space.areaName, space.city);

	return (
		<Container component="main" maxWidth="lg" className={styles.page}>
			<Typography variant="caption" color="text.secondary" className={styles.crumb}>
				<Link href="/">All spaces</Link>
			</Typography>

			<header className={styles.header}>
				<Typography variant="displayLg">{space.title}</Typography>
				<Typography color="text.secondary">
					{location} · {spaceTypeLabels[space.type]} · {settingLabels[space.setting]}
				</Typography>
			</header>

			<div className={styles.gallery}>
				{space.photos.length > 0 ? (
					space.photos.map((photo) => (
						<PhotoFrame key={photo.url} photo={photo} sizes="(min-width: 900px) 50vw, 100vw" />
					))
				) : (
					<PhotoFrame photo={null} sizes="100vw" />
				)}
			</div>

			<div className={styles.columns}>
				<div className={styles.main}>
					<section className={styles.about}>
						<Typography variant="displaySm">About this space</Typography>
						<Typography>{space.description}</Typography>
						{space.tags.length > 0 && (
							<ul aria-label="Tags" className={styles.tags}>
								{space.tags.map((tag) => (
									<li key={tag.slug}>
										<Chip label={tag.label} variant="outlined" size="small" />
									</li>
								))}
							</ul>
						)}
					</section>

					<SpaceFacts space={space} />

					<section className={styles.where}>
						<Typography variant="displaySm">Where</Typography>
						<Typography>{location}</Typography>
						<Typography variant="caption" color="text.secondary">
							The host shares the full address once they accept your inquiry.
						</Typography>
					</section>
				</div>

				<div className={styles.aside}>
					<RatePanel rates={space.rates} rateNotes={space.rateNotes} host={space.host} />
				</div>
			</div>
		</Container>
	);
}
```

- [ ] **Step 4: Implement not-found**

Create `app/spaces/[slug]/not-found.tsx`. It deliberately doesn't say whether the slug exists but is unpublished.

```tsx
import Link from "next/link";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import styles from "@/app/_styles/message.module.scss";

export default function SpaceNotFound() {
	return (
		<Container component="main" maxWidth="sm" className={styles.screen}>
			<Typography variant="displayLg">This space isn&apos;t listed</Typography>
			<Typography color="text.secondary">It may have been paused by its host, or the link is wrong.</Typography>
			<Typography className={styles.link}>
				<Link href="/">Browse all spaces</Link>
			</Typography>
		</Container>
	);
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm test -- --runTestsByPath "app/spaces/[slug]/page.test.tsx"`
Expected: PASS, 9 tests.

### Task 11: Definition of done

**Files:** none changed. This task only verifies.

- [ ] **Step 1: Full gate**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
Expected: the route table shows `ƒ /` and `ƒ /spaces/[slug]`; typecheck and lint are clean; **10 suites, 63 tests** pass (including `app/_lib/sanity.test.ts`).

- [ ] **Step 2: Styling discipline check**

```bash
grep -rnE "sx=|sx:|styled\(|style=\{\{" app --include='*.tsx'
grep -rnE "#[0-9a-fA-F]{3,8}\b|font-family" app --include='*.scss'
```

Expected: no output from either.

- [ ] **Step 3: Source privacy check — read, don't assume**

```bash
grep -rnE "include:|host: true|contactEmail|contactPhone|exactAddress|latitude|longitude|barangay" app --include='*.ts' --include='*.tsx'
```

Expected: exactly these, and nothing else:
- comments: `app/_lib/types.ts` lines 3 and 45; `app/_lib/server/spaces.ts` lines 2–3
- `app/_lib/server/spaces.test.ts`: the `PRIVATE_FIELDS` list and the leaky-row fixture
- `app/error.test.tsx`: the fake error message that the test proves is never shown

Any match in a select, a component, a prop or a route file is a bug. Then open `app/_lib/server/spaces.ts` and read `cardSelect`, `detailSelect` and both mappers line by line.

- [ ] **Step 4: Rendered privacy check against seeded data**

Needs the local database (`docker compose up -d`, `pnpm db:seed`).

```bash
pnpm start -p 3457 &
sleep 4
curl -s http://localhost:3457/ -o /tmp/iskawt-browse.html
curl -s http://localhost:3457/spaces/demo-poblacion-loft -o /tmp/iskawt-detail.html
curl -s -o /dev/null -w 'missing slug: %{http_code}\n' http://localhost:3457/spaces/does-not-exist
kill %1
grep -c '<article' /tmp/iskawt-browse.html
cat /tmp/iskawt-browse.html /tmp/iskawt-detail.html | grep -oE 'example\.invalid|Polaris St|contactEmail|contactPhone|exactAddress|latitude|\[UNIT NO|\[HOUSE NO|barangay' | sort | uniq -c
```

Expected: `missing slug: 404`; `8` articles (the eight seeded DEMO spaces); **no output** from the leak grep. The grep also covers the RSC payload embedded in the HTML.

- [ ] **Step 5: Visual check (human)**

Open `/` and `/spaces/demo-poblacion-loft` at about 375px and 1280px wide, in light and dark mode. Compare hierarchy (not pixels) with `docs/mockups/`. Tests can't see layout.

### ⛔ Checkpoint 6: reviewer on the full slice, then stop for human commit

Report the outputs of Task 11 Steps 1–4. Suggested message: `feat(detail): listing detail page with specs and indicative rates`

---

## Not in this plan

- **Cypress e2e** (browse → click → detail): deferred to v2 by the human.
- **Site header/nav** from the mockups: there are no other pages to link to yet.
- **Inquiry form**: slice 5.
- **Filters, search, pagination**: slice 4.
