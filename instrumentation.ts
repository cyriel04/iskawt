// Registers Sentry for the server and edge runtimes, and captures errors from
// route handlers, server components and proxies. Off without SENTRY_DSN.
import * as Sentry from "@sentry/nextjs";

export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
	if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

export const onRequestError = Sentry.captureRequestError;
