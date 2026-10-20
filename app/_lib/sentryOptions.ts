// The init options every runtime shares. Off without a DSN, so local dev, CI
// and tests send nothing. Errors only: no tracing, and no SDK data collection.

import type { init } from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "@/app/_lib/sentryScrub";

// The real option types, taken from Sentry.init so a typo or a removed option
// fails typecheck. (`sendDefaultPii` is gone in 11.x; `dataCollection` replaced it.)
type InitOptions = NonNullable<Parameters<typeof init>[0]>;
type DataCollection = NonNullable<InitOptions["dataCollection"]>;

// Every category named, every flag off: the SDK's defaults collect all of it.
type DataCollectionOff = Required<DataCollection> & {
	graphQL: Required<NonNullable<DataCollection["graphQL"]>>;
	genAI: Required<NonNullable<DataCollection["genAI"]>>;
};

const DATA_COLLECTION_OFF = {
	userInfo: false,
	cookies: false,
	httpHeaders: false,
	httpBodies: [],
	urlQueryParams: false,
	graphQL: { document: false, variables: false },
	genAI: { inputs: false, outputs: false },
	databaseQueryData: false,
	queues: false,
	stackFrameVariables: false,
	frameContextLines: 0,
} satisfies DataCollectionOff;

export type SharedSentryOptions = {
	dsn: string | undefined;
	enabled: boolean;
	environment: string;
	dataCollection: DataCollectionOff;
	tracesSampleRate: 0;
	beforeSend: typeof scrubEvent;
	beforeBreadcrumb: typeof scrubBreadcrumb;
};

export function sentryOptions(dsn: string | undefined): SharedSentryOptions {
	const options = {
		dsn: dsn || undefined,
		enabled: Boolean(dsn),
		environment: process.env.VERCEL_ENV ?? "development",
		// A fresh copy per call, so no runtime can mutate another's settings.
		dataCollection: { ...DATA_COLLECTION_OFF, httpBodies: [], graphQL: { ...DATA_COLLECTION_OFF.graphQL }, genAI: { ...DATA_COLLECTION_OFF.genAI } },
		tracesSampleRate: 0,
		beforeSend: scrubEvent,
		beforeBreadcrumb: scrubBreadcrumb,
	} satisfies SharedSentryOptions & InitOptions;
	return options;
}
