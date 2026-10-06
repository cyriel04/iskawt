// Where to send someone after sign-in. Only a path on this site: anything that
// could leave it (//host, /\host, a scheme, an encoded slash, whitespace or
// control characters, or dot segments that resolve to //host) falls back to "/".
const BASE = "http://x";

export function safeNext(raw: string | string[] | undefined): string {
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (!value || !value.startsWith("/")) return "/";
	if (value.startsWith("//") || value.startsWith("/\\")) return "/";
	if (/[\s\\]|%2f|%5c/i.test(value)) return "/";
	if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return "/";
	let resolved: URL;
	try {
		resolved = new URL(value, BASE);
	} catch {
		return "/";
	}
	// "/..//evil" resolves to the path "//evil", which a later redirect could
	// read as a host.
	if (resolved.origin !== BASE || resolved.pathname.startsWith("//")) return "/";
	return value;
}
