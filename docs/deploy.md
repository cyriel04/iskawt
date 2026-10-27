# Deploying Iskawt

Iskawt runs on **Vercel** (region `sin1`, Singapore), with **Neon** Postgres in Singapore, **Resend** for email and **Sentry** for errors. This checklist covers the first deploy. After that, every merge to `main` deploys on its own.

## How a deploy runs

Vercel runs `pnpm vercel-build` (`scripts/vercel-build.sh`, chosen by `vercel.json`):

1. `prisma generate`, always.
2. **Production only** (`VERCEL_ENV=production`): `prisma migrate deploy`, then `pnpm db:seed` if `DEMO_SEED=true`.
3. `next build`, always.

If any step fails, the build fails and the previous deployment stays live.

Only `main` deploys. `vercel.json` sets `git.deploymentEnabled` to `false` for every other branch, so PRs get no preview deployment and no Vercel check. CI on the PR is the gate.

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
3. **Settings → Environment Variables.**

Every variable is **Production** only:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled URL |
| `DIRECT_DATABASE_URL` | Neon direct URL |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | the production URL |
| `RESEND_API_KEY` | from step 2 |
| `EMAIL_FROM` | from step 2 |
| `OPS_EMAIL_TO` | the inbox that gets report and host-application notices |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | the DSN |
| `SENTRY_ORG`, `SENTRY_PROJECT` | the slugs |
| `SENTRY_AUTH_TOKEN` | the token (mark it **Sensitive**) |
| `DEMO_SEED` | `true` |
| `OPS_TEST_KEY` | `openssl rand -hex 32` |

Never scope the Neon URLs to Preview. If previews are ever switched back on, a preview would then read, and could write, production data.

`REPORTS_EMAIL_TO` is the old name for `OPS_EMAIL_TO`. Don't set it on a new deploy.

## 5. First deploy

1. Redeploy (or push to `main`). In the build log, check for, in order: `prisma generate`, `prisma migrate deploy` with every migration applied, the seed finishing, then `next build`.
2. If the seed stops with a guard error, read it. It refuses to overwrite a non-demo space with a demo slug, and it refuses a demo space with no photo.

## 6. Smoke check

Run this after the first deploy, and after any deploy that changes auth, email or Sentry.

- [ ] **Browse** `/`: 8 spaces, each with a photo and the "Demo photo · not a real space" badge.
- [ ] **Listing** `/spaces/demo-poblacion-loft`: a big photo with two beside it. The ‹ › arrows on the big photo change it, and its counter reads "1 / 3", "2 / 3", and so on. The big photo carries one "Demo photos · not a real space" badge, and the "Demo listing, for internal use only" strip sits under the gallery. No exact address, no host email or phone anywhere on the page (view source too).
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
3. Redeploy. The badges and the disclaimer strip only ever showed on demo spaces, so nothing else needs changing.
