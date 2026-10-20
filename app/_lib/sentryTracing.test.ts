/** @jest-environment node */
// The real SDK, no mocks: a request carrying a sampled `sentry-trace` header must
// not make the server send spans. Span and transaction envelopes skip
// `beforeSend`, so they would skip the scrubber too.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/app/_lib/sentryOptions";

type InitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
type Transport = ReturnType<NonNullable<InitOptions["transport"]>>;
type Envelope = Parameters<Transport["send"]>[0];

const sent: Envelope[] = [];
const capturingTransport = (): Transport => ({
	send: (envelope) => {
		sent.push(envelope);
		return Promise.resolve({ statusCode: 200 });
	},
	flush: () => Promise.resolve(true),
});

const itemTypes = () => sent.flatMap(([, items]) => items.map(([header]) => header.type));

// A sampled incoming trace: "<trace id>-<parent span id>-1".
const SAMPLED_TRACE = "771a43a4192642f0b136d5159a501700-b7ad6b7169203331-1";

// Jest has no diagnostics-channel injection; the SDK warns once at init. Silence only that.
const realWarn = console.warn;
beforeAll(() => {
	jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
		if (args.map(String).join(" ").includes("diagnostics-channel injection")) return;
		realWarn(...args);
	});
	Sentry.init({ ...sentryOptions("https://k@o1.ingest.sentry.io/1"), integrations: [], defaultIntegrations: false, transport: capturingTransport });
});
beforeEach(() => {
	sent.length = 0;
});
afterAll(async () => {
	await Sentry.close();
	jest.restoreAllMocks();
});

it("sends an error through the capturing transport, so the transport is wired", async () => {
	Sentry.captureException(new TypeError("Cannot read properties of undefined (reading 'title')"));
	await Sentry.flush(2000);
	expect(itemTypes()).toContain("event");
});

it("does not continue a sampled incoming trace into span or transaction envelopes", async () => {
	Sentry.continueTrace({ sentryTrace: SAMPLED_TRACE, baggage: undefined }, () =>
		Sentry.startSpan({ name: "GET /spaces/[slug]" }, () => {
			Sentry.startSpan({ name: "prisma:query" }, () => {});
		}),
	);
	await Sentry.flush(2000);
	expect(itemTypes()).not.toContain("span");
	expect(itemTypes()).not.toContain("transaction");
});
