# Slice 7b — Error monitoring with Sentry

Status: design approved in the main session, 2026-10-20. Awaiting spec review.
`PLAN.md` puts this before the deploy (now **7c**, ship), so production starts
monitored. With no DSN set (local dev, CI, tests), Sentry is fully off.

## What this slice does

When something breaks in production, the error reaches Sentry with enough to fix
it: a server route that 500s, a server component that throws, an email send that
fails, or a page that crashes in someone's browser. None of the product's private
data can reach Sentry:
- host contact details;
- exact addresses;
- emails;
- message bodies;
- report details;
- host-application fields.

## Decisions

| Question | Decision |
| --- | --- |
| Scope | **Errors only.** No performance tracing (`tracesSampleRate: 0`), no Session Replay, no profiling. |
| Identifying users | An **opaque user id only** (`User.id`), set on the server. Never an email, name or IP. The browser never sends an id. |
| Keeping private data out | An **allowlist** in one pure, tested function, `scrubEvent`. It runs as `beforeSend` and `beforeBreadcrumb` everywhere. Sentry's project-side data scrubbing is switched on as a backstop. |
| Package | `@sentry/nextjs`, the official Next.js SDK. A new dependency, approved by the human for this slice. Pin the version installed, and confirm Next 16 support against its docs before wiring. |
| Existing ops log lines | The 7 `console.error` call sites stay, and each also goes to Sentry with the same id-only data. |
| Source maps | Uploaded at build time when `SENTRY_AUTH_TOKEN` is set, then deleted from the public build output. |
| Delivery | One PR, three tasks. |

## What a Sentry event may contain (the allowlist)

`scrubEvent(event, hint)` returns a new event built **only** from these fields. Anything not listed is dropped.

| Field | Kept as |
| --- | --- |
| `exception.values[].type` | as is |
| `exception.values[].value` | see **Messages** below |
| `exception.values[].stacktrace.frames[]` | `filename`, `function`, `lineno`, `colno`, `in_app` and `module` only. `vars`, `pre_context`, `context_line` and `post_context` are removed. |
| `exception.values[].mechanism` | `type` and `handled` only |
| `message` (from `captureMessage`) | kept only if it is one of `OPS_MESSAGES`, the fixed log strings below. Any other message event is dropped entirely (`scrubEvent` returns `null`). |
| `level`, `platform`, `timestamp`, `event_id`, `release`, `environment`, `fingerprint`, `transaction` | as is. `transaction` is cut to its route pattern, with no query. |
| `request` | `method`, plus `url` reduced to origin + pathname. No `query_string`, `data`, `cookies`, `headers` or `env`. |
| `user` | `{ id }` only |
| `extra` | only the keys `inquiryId`, `reportId`, `applicationId`, `userId` and `status`, and only when the value is a string or number of at most 64 characters |
| `tags` | only `runtime` and `route` |
| `contexts` | only `runtime`, `os`, `browser` and `device` (set by the SDK; no user data) |
| `breadcrumbs` | see **Breadcrumbs** below |
| `sdk` | as is |

**Messages.** `exception.value` is the most likely place for user data to leak, for example a Prisma error that quotes its arguments. So it follows these rules:
- **Prisma errors.** The original error's `name` starts with `PrismaClient`. The value becomes `"<name> <code>"`, for example `PrismaClientKnownRequestError P2002`. The code is left out when there isn't one. The original message is never kept.
- **Engine errors.** The type is `TypeError`, `ReferenceError` or `RangeError`, and the value is at most 200 characters. The value is kept: these are JavaScript engine messages, like "Cannot read properties of undefined (reading 'x')". `SyntaxError` is **not** kept, because JSON parse errors quote their input.
- **Anything else:** the value becomes `"[message removed]"`.

**Breadcrumbs** (`beforeBreadcrumb`):
- **Kept:**
  - `navigation`, with `from` and `to` reduced to the path, no query;
  - `fetch` and `xhr`, with `method`, the URL reduced to its path, and `status_code`.
- **Dropped:** `console`, `ui.click`, `ui.input` and everything else. `ui.click` messages are CSS selectors that can carry accessible names, like "Block {name}".

**`OPS_MESSAGES`.** These are the fixed strings the server already logs. Only these may be sent as `message`:
- `[inquiry] notify failed`
- `[report] notify failed`
- `[report] no OPS_EMAIL_TO`
- `[host-application] notify failed`
- `[host-application] no OPS_EMAIL_TO`
- `[auth] host link failed`

## Wiring

**Server and edge** (`backend-dev`):
- **`instrumentation.ts`** at the repo root. `register()` imports the server config (Node runtime) or the edge config, and `export const onRequestError = Sentry.captureRequestError`.
- **`sentry.server.config.ts`** and **`sentry.edge.config.ts`** call `Sentry.init`:
  - `dsn: process.env.SENTRY_DSN`;
  - `enabled: Boolean(process.env.SENTRY_DSN)`;
  - `environment: process.env.VERCEL_ENV ?? "development"`;
  - `sendDefaultPii: false`;
  - `tracesSampleRate: 0`;
  - `includeLocalVariables: false`;
  - `beforeSend: scrubEvent` and `beforeBreadcrumb: scrubBreadcrumb`.
- **`app/_lib/server/opsLog.ts`.** `opsError(message: OpsMessage, extra: Record<string, string | number>)` keeps the existing `console.error(message, extra)` and adds `Sentry.captureMessage(message, { level: "error", extra })`. The 7 `console.error` call sites switch to it, and each keeps its current text and fields. They are in `inquiryNotify.ts` (two), `reportNotify.ts` (two), `hostApplicationNotify.ts` (two) and `authHooks.ts` or `hostLink.ts` (one).
- **The user.** `getCurrentUser()` calls `Sentry.setUser({ id })` when a user is found, and `Sentry.setUser(null)` when none is. The SDK isolates this per request.

**Browser** (`frontend-dev`):
- **`instrumentation-client.ts`** at the repo root. `Sentry.init` uses:
  - `dsn: process.env.NEXT_PUBLIC_SENTRY_DSN`;
  - `enabled` set from that same DSN;
  - `sendDefaultPii: false`;
  - `tracesSampleRate: 0`;
  - no `replayIntegration`;
  - `beforeSend` and `beforeBreadcrumb` from the same scrubber.
  - It never calls `setUser`.
- **`app/error.tsx`.** `useEffect(() => Sentry.captureException(error), [error])`. It still renders nothing from `error`. The comment changes to say Sentry gets the error, scrubbed.
- **`app/global-error.tsx`** (new). This is the root-layout error boundary. It has its own `<html><body>`, the same message and "Try again" button, and reports through the same `captureException`. It uses the existing `message.module.scss` styles. There is no theme provider here, so it uses plain elements styled through the module.

**Build** (`backend-dev`, since it touches config):
- `next.config.ts` is wrapped with `withSentryConfig(nextConfig, { … })`, with these options:
  - `org` and `project` from `SENTRY_ORG` and `SENTRY_PROJECT`;
  - `authToken` from `SENTRY_AUTH_TOKEN`;
  - `silent: !process.env.CI`;
  - `sourcemaps: { deleteSourcemapsAfterUpload: true }`;
  - `telemetry: false`;
  - no `tunnelRoute`.
- Without `SENTRY_AUTH_TOKEN`, the build must still succeed and simply skip the upload. CI has no token.
- The `@sentry/cli` install script, if pnpm blocks it, gets approved through `pnpm approve-builds`, which records it in `pnpm-workspace.yaml`. Never through `dangerouslyAllowAllBuilds`.

**Shared** (`app/_lib/sentryScrub.ts`, pure, imported by all three configs): `scrubEvent`, `scrubBreadcrumb`, `OPS_MESSAGES` and the `OpsMessage` type. It imports only types from `@sentry/nextjs`.

## Environment

Added to `.env.example` and the README by the main session:
- `SENTRY_DSN`: the server DSN.
- `NEXT_PUBLIC_SENTRY_DSN`: the browser DSN. It is the same value, and public by nature.
- `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN`: used only at build time, for source maps. The token is a secret, and lives in Vercel's environment settings, never in the repo.

Left unset, Sentry is off and nothing is sent.

## Setting up Sentry (the human, in Sentry's UI)

These steps are on the 7c deploy checklist:
- Create the project.
- Turn on **Data Scrubbing** and **Scrub IP Addresses** in the project's security and privacy settings. Add `address`, `body`, `detail`, `description`, `email` and `message` to "Additional Sensitive Fields".
- Leave Session Replay and Performance off.

## Testing

- **`sentryScrub.test.ts`** is the core of the slice. Build fixture events stuffed with demo private data:
  - an email `demo-host@example.invalid`;
  - the address `[UNIT NO.] [BUILDING NAME], Demo Street, Poblacion, Makati`;
  - the message body `Free on the 20th? Call me on 0917…`;
  - report detail.

  Put that data in every field Sentry fills: the exception value, frame vars and context lines, request data, query string, cookies, headers, extra, tags, contexts, user, and breadcrumbs of every category. Then assert:
  - **No leaks:** `JSON.stringify(scrubEvent(event, hint))` contains none of the demo strings.
  - **Allowed fields survive:** the allowlisted fields come through, including the type, frames without vars, the route pattern, `user.id` and the allowed `extra` keys.
  - **Prisma:** a Prisma error whose message quotes the body becomes `PrismaClientValidationError` or `PrismaClientKnownRequestError P2002`.
  - **Engine and other errors:** `TypeError` messages are kept, and `SyntaxError` and plain `Error` messages are removed.
  - **Messages:** an `OPS_MESSAGES` message is kept. An event carrying any other `message` returns `null`.
  - **Breadcrumbs:** `scrubBreadcrumb` returns `null` for console and ui crumbs, and strips queries from navigation and fetch crumbs.
- **`opsLog.test.ts`:** `opsError` writes the same `console.error` line as today and calls `captureMessage` with the same data.
- **The 7 call sites:** their existing tests assert `console.error` calls. They keep passing unchanged, which proves the log text and fields didn't change.
- **`currentUser.test.ts`:** `setUser({ id })` is called on a hit, `setUser(null)` on a miss, and never with an email.
- **`error.tsx` / `global-error.tsx`:** `captureException` is called with the error, and the rendered output contains nothing from `error.message`.
- **Config:** a test asserts the three init option objects have `sendDefaultPii: false`, `tracesSampleRate: 0`, and `beforeSend` set to `scrubEvent`. To make that testable, each config exports its options object.
- **Build:** `pnpm build` succeeds with no Sentry env vars set.

## Out of scope

- Performance tracing, Session Replay, profiling and user feedback widgets.
- Alert rules and notification routing. These are set up in Sentry's UI.
- A tunnel route that hides Sentry requests from ad blockers.
- Monitoring Prisma queries.

## Size and delivery

One PR, `feat/slice-7b-sentry`, with three tasks:
1. **The dependency and the scrubber** (`backend-dev`): install `@sentry/nextjs` and approve its build script if needed, then `sentryScrub.ts` and its tests.
2. **Server wiring** (`backend-dev`): `instrumentation.ts`, the server and edge configs, `next.config.ts`, `opsLog.ts`, the 7 call sites and `getCurrentUser`.
3. **Browser wiring** (`frontend-dev`): `instrumentation-client.ts`, `error.tsx` and `global-error.tsx`.

About 14 files, a third of them tests. The main session adds the env lines to `.env.example` and the README.
