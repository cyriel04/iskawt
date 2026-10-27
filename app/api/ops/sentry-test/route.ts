// Post-deploy check that Sentry receives events from production (docs/deploy.md).
// Locked behind OPS_TEST_KEY; without it this is indistinguishable from no route.
// Default: an ops message sent from after(), which proves after() flushes.
// ?mode=throw: an unhandled error, which proves route errors are captured.
// Nothing from the request is logged or sent.

import { createHash, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { opsError } from "@/app/_lib/server/opsLog";

export const dynamic = "force-dynamic";

// Hash both sides so the compare is constant-time whatever the lengths.
const digest = (value: string) => createHash("sha256").update(value).digest();

function authorised(request: Request): boolean {
	const expected = process.env.OPS_TEST_KEY;
	const given = request.headers.get("x-ops-key");
	if (!expected || given === null) return false;
	return timingSafeEqual(digest(given), digest(expected));
}

export async function GET(request: Request): Promise<Response> {
	if (!authorised(request)) return new Response(null, { status: 404 });

	if (new URL(request.url).searchParams.get("mode") === "throw") {
		throw new Error("Sentry smoke test");
	}

	after(() => opsError("[ops] sentry smoke test"));
	return Response.json({ scheduled: true }, { status: 202 });
}
