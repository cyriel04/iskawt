// The server's ops log lines: written to the console as before, and sent to
// Sentry with the same id-only data. Only the fixed OPS_MESSAGES are allowed;
// the scrubber drops any other message event.

import * as Sentry from "@sentry/nextjs";
import type { OpsMessage } from "@/app/_lib/sentryScrub";

export function opsError(message: OpsMessage, extra?: Record<string, string | number>): void {
	if (extra) console.error(message, extra);
	else console.error(message);
	Sentry.captureMessage(message, { level: "error", extra });
}
