// Where to send someone after sign-in. Only a path on this site: anything that
// could leave it (//host, /\host, a scheme, an encoded slash, whitespace or
// control characters) falls back to "/".
export function safeNext(raw: string | string[] | undefined): string {
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (!value || !value.startsWith("/")) return "/";
	if (value.startsWith("//") || value.startsWith("/\\")) return "/";
	if (/[\s\\]|%2f|%5c/i.test(value)) return "/";
	return value;
}
