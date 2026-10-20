/** @jest-environment node */
import { scrubBreadcrumb, scrubEvent } from "@/app/_lib/sentryScrub";
import { sentryOptions } from "@/app/_lib/sentryOptions";

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
};

it("switches off every SDK data-collection category", () => {
	expect(sentryOptions(undefined).dataCollection).toEqual(DATA_COLLECTION_OFF);
	expect(sentryOptions("https://k@o1.ingest.sentry.io/1").dataCollection).toEqual(DATA_COLLECTION_OFF);
});

it("has no sendDefaultPii, which 11.x does not read", () => {
	expect(sentryOptions(undefined)).not.toHaveProperty("sendDefaultPii");
});

it("is off without a DSN and on with one; no SDK data collection, never tracing", () => {
	expect(sentryOptions(undefined)).toMatchObject({ dsn: undefined, enabled: false });
	expect(sentryOptions("")).toMatchObject({ enabled: false });
	expect(sentryOptions("https://k@o1.ingest.sentry.io/1")).toMatchObject({
		enabled: true,
		dataCollection: DATA_COLLECTION_OFF,
		tracesSampleRate: 0,
		beforeSend: scrubEvent,
		beforeBreadcrumb: scrubBreadcrumb,
	});
});

it("takes the environment from VERCEL_ENV, defaulting to development", () => {
	const before = process.env.VERCEL_ENV;
	delete process.env.VERCEL_ENV;
	expect(sentryOptions(undefined).environment).toBe("development");
	process.env.VERCEL_ENV = "production";
	expect(sentryOptions(undefined).environment).toBe("production");
	if (before === undefined) delete process.env.VERCEL_ENV;
	else process.env.VERCEL_ENV = before;
});
