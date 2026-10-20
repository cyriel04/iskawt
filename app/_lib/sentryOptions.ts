// The init options every runtime shares. Off without a DSN, so local dev, CI
// and tests send nothing. Errors only: no tracing, no PII from the SDK.

import { scrubBreadcrumb, scrubEvent } from "@/app/_lib/sentryScrub";

export type SharedSentryOptions = {
	dsn: string | undefined;
	enabled: boolean;
	environment: string;
	sendDefaultPii: false;
	tracesSampleRate: 0;
	beforeSend: typeof scrubEvent;
	beforeBreadcrumb: typeof scrubBreadcrumb;
};

export function sentryOptions(dsn: string | undefined): SharedSentryOptions {
	return {
		dsn: dsn || undefined,
		enabled: Boolean(dsn),
		environment: process.env.VERCEL_ENV ?? "development",
		sendDefaultPii: false,
		tracesSampleRate: 0,
		beforeSend: scrubEvent,
		beforeBreadcrumb: scrubBreadcrumb,
	};
}
