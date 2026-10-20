// What may leave for Sentry. An allowlist: every event and breadcrumb is rebuilt
// from the fields listed in docs/superpowers/specs/2026-10-20-slice-7b-sentry-design.md,
// and anything else is dropped. Pure; shared by the server, edge and browser configs.

import type { Breadcrumb, ErrorEvent, EventHint, Exception, SdkInfo, StackFrame } from "@sentry/nextjs";

// Not exported by @sentry/nextjs 11.4.0; derived from the types that are.
type Mechanism = NonNullable<Exception["mechanism"]>;
type DebugImage = NonNullable<NonNullable<ErrorEvent["debug_meta"]>["images"]>[number];

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
// Engine messages are an allowlist too: a denylist can't cover every V8 shape that
// quotes a value. A message is kept only if it is wholly one of these templates.
const IDENT = "[A-Za-z_$][\\w$]{0,40}";
const ENGINE_TEMPLATES: readonly RegExp[] = [
	new RegExp(`^Cannot read properties of (null|undefined) \\(reading '${IDENT}'\\)$`),
	new RegExp(`^${IDENT} is not defined$`),
	new RegExp(`^${IDENT}(\\.${IDENT}){0,4}(\\(\\.\\.\\.\\))? is not a function$`),
];

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

function stringCode(original: unknown): string | undefined {
	if (typeof original !== "object" || original === null || !("code" in original)) return undefined;
	return typeof original.code === "string" ? original.code : undefined;
}

function safeValue(exception: Exception, original: unknown): string | undefined {
	const { type, value } = exception;
	if (type?.startsWith("PrismaClient")) {
		const code = original instanceof Error && original.name === type ? stringCode(original) : undefined;
		return code ? `${type} ${code}` : type;
	}
	if (value === undefined) return undefined;
	if (!type || !ENGINE_ERRORS.includes(type)) return REMOVED;
	return ENGINE_TEMPLATES.some((template) => template.test(value)) ? value : REMOVED;
}

const frame = ({ filename, function: fn, lineno, colno, in_app, module }: StackFrame): StackFrame => ({
	filename,
	function: fn,
	lineno,
	colno,
	in_app,
	module,
});

// Kept for the cause chain: numbers, booleans and short fixed strings. Never `data`.
const mechanism = ({ type, handled, exception_id, parent_id, source, is_exception_group }: Mechanism): Mechanism => ({
	type,
	handled,
	exception_id,
	parent_id,
	source,
	is_exception_group,
});

function exception(e: Exception, original: unknown): Exception {
	return {
		type: e.type,
		value: safeValue(e, original),
		mechanism: e.mechanism ? mechanism(e.mechanism) : undefined,
		stacktrace: e.stacktrace?.frames ? { frames: e.stacktrace.frames.map(frame) } : undefined,
	};
}

// Rebuilt with IP inference forced off, so a future SDK default can't undo it.
const sdk = (info: SdkInfo | undefined): SdkInfo => ({
	name: info?.name,
	version: info?.version,
	integrations: info?.integrations,
	packages: info?.packages,
	settings: { infer_ip: "never" },
});

// Source maps need type, code_file and debug_id. Mach-O images (native apps only)
// require more fields than that, so they are dropped rather than kept whole.
function debugImage(image: DebugImage): DebugImage[] {
	if (image.type === "macho") return [];
	return [{ type: image.type, code_file: image.code_file, debug_id: image.debug_id }];
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
		sdk: sdk(event.sdk),
		debug_meta: event.debug_meta?.images ? { images: event.debug_meta.images.flatMap(debugImage) } : undefined,
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
