// Sentry in the browser: errors only, scrubbed by the shared allowlist. No
// tracing, no Replay, and no user: the browser never sends an id. Off without
// NEXT_PUBLIC_SENTRY_DSN.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/app/_lib/sentryOptions";

Sentry.init(sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));
