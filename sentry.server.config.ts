// Sentry on the Node server. Options are shared and scrubbed; see app/_lib/sentryOptions.ts.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/app/_lib/sentryOptions";

Sentry.init({ ...sentryOptions(process.env.SENTRY_DSN), includeLocalVariables: false });
