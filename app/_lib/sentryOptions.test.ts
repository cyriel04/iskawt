/** @jest-environment node */
import { scrubBreadcrumb, scrubEvent } from "@/app/_lib/sentryScrub";
import { sentryOptions } from "@/app/_lib/sentryOptions";

it("is off without a DSN and on with one; never PII, never tracing", () => {
	expect(sentryOptions(undefined)).toMatchObject({ dsn: undefined, enabled: false });
	expect(sentryOptions("")).toMatchObject({ enabled: false });
	expect(sentryOptions("https://k@o1.ingest.sentry.io/1")).toMatchObject({
		enabled: true,
		sendDefaultPii: false,
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
