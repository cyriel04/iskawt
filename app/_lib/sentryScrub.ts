// What may leave for Sentry. An allowlist: every event and breadcrumb is rebuilt
// from the fields listed in docs/superpowers/specs/2026-10-20-slice-7b-sentry-design.md,
// and anything else is dropped. Pure; shared by the server, edge and browser configs.

import type { Breadcrumb, ErrorEvent, EventHint, Exception, StackFrame } from "@sentry/nextjs";

export const OPS_MESSAGES = [
	"[inquiry] notify failed",
	"[report] notify failed",
	"[report] no OPS_EMAIL_TO",
	"[host-application] notify failed",
	"[host-application] no OPS_EMAIL_TO",
	"[auth] host link failed",
] as const;
export type OpsMessage = (typeof OPS_MESSAGES)[number];

const isOpsMessage = (value: unknown): value is OpsMessage =>
	typeof value === "string" && (OPS_MESSAGES as readonly string[]).includes(value);

const EXTRA_KEYS: readonly string[] = ["inquiryId", "reportId", "applicationId", "userId", "status"];
const TAG_KEYS: readonly string[] = ["runtime", "route"];
const CONTEXT_KEYS = ["runtime", "os", "browser", "device"] as const;
const ENGINE_ERRORS: readonly string[] = ["TypeError", "ReferenceError", "RangeError"];
const REMOVED = "[message removed]";

// "https://h/p?q" → "https://h/p"; "/p?q" → "/p". Anything unparseable is dropped.
function withoutQuery(url: unknown, keepOrigin: boolean): string | undefined {
	if (typeof url !== "string" || url === "") return undefined;
	try {
		const parsed = new URL(url, "http://relative.invalid");
		return keepOrigin && !url.startsWith("/") ? `${parsed.origin}${parsed.pathname}` : parsed.pathname;
	} catch {
		return undefined;
	}
}

function pick<T extends Record<string, unknown>>(source: T | undefined, keys: readonly string[], ok: (v: unknown) => boolean): Partial<T> | undefined {
	if (!source) return undefined;
	const out: Partial<T> = {};
	for (const key of keys) {
		if (key in source && ok(source[key])) out[key as keyof T] = source[key as keyof T];
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

const shortScalar = (v: unknown) => (typeof v === "string" && v.length <= 64) || typeof v === "number";

function prismaCode(original: unknown): string | undefined {
	if (typeof original !== "object" || original === null || !("code" in original)) return undefined;
	return typeof original.code === "string" ? original.code : undefined;
}

function safeValue(exception: Exception, original: unknown): string | undefined {
	const { type, value } = exception;
	if (type?.startsWith("PrismaClient")) {
		const code = original instanceof Error && original.name === type ? prismaCode(original) : undefined;
		return code ? `${type} ${code}` : type;
	}
	if (value === undefined) return undefined;
	if (type && ENGINE_ERRORS.includes(type) && value.length <= 200) return value;
	return REMOVED;
}

const frame = ({ filename, function: fn, lineno, colno, in_app, module }: StackFrame): StackFrame => ({
	filename,
	function: fn,
	lineno,
	colno,
	in_app,
	module,
});

function exception(e: Exception, original: unknown): Exception {
	return {
		type: e.type,
		value: safeValue(e, original),
		mechanism: e.mechanism ? { type: e.mechanism.type, handled: e.mechanism.handled } : undefined,
		stacktrace: e.stacktrace?.frames ? { frames: e.stacktrace.frames.map(frame) } : undefined,
	};
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
	const { category, type, data, timestamp, level } = breadcrumb;
	if (category === "navigation") {
		return { category, timestamp, level, data: { from: withoutQuery(data?.from, false), to: withoutQuery(data?.to, false) } };
	}
	if (category === "fetch" || category === "xhr") {
		return {
			category,
			type,
			timestamp,
			level,
			data: { method: data?.method, url: withoutQuery(data?.url, false), status_code: data?.status_code },
		};
	}
	return null;
}

export function scrubEvent(event: ErrorEvent, hint?: EventHint): ErrorEvent | null {
	if (event.message !== undefined && !isOpsMessage(event.message)) return null;
	const original = hint?.originalException;
	const user = event.user?.id !== undefined ? { id: event.user.id } : undefined;
	const contexts = event.contexts
		? Object.fromEntries(CONTEXT_KEYS.filter((key) => event.contexts?.[key]).map((key) => [key, event.contexts?.[key]]))
		: undefined;
	const scrubbed: ErrorEvent = {
		type: undefined,
		event_id: event.event_id,
		level: event.level,
		platform: event.platform,
		timestamp: event.timestamp,
		release: event.release,
		environment: event.environment,
		fingerprint: event.fingerprint,
		transaction: event.transaction?.split("?")[0],
		sdk: event.sdk,
		message: event.message,
		exception: event.exception?.values ? { values: event.exception.values.map((e) => exception(e, original)) } : undefined,
		request: event.request ? { method: event.request.method, url: withoutQuery(event.request.url, true) } : undefined,
		user,
		extra: pick(event.extra, EXTRA_KEYS, shortScalar),
		tags: pick(event.tags, TAG_KEYS, shortScalar),
		contexts: contexts && Object.keys(contexts).length > 0 ? contexts : undefined,
		breadcrumbs: event.breadcrumbs?.map(scrubBreadcrumb).filter((b): b is Breadcrumb => b !== null),
	};
	// Drop undefined keys so the event is exactly the allowlist.
	return JSON.parse(JSON.stringify(scrubbed)) as ErrorEvent;
}
