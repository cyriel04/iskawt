// Better Auth redirects an expired, reused or unknown link to
// /sign-in?error=INVALID_TOKEN; 1.7.7 never sends a separate expired code. Any
// value counts as one kind of failure, and the raw value is never rendered.
// Kept out of SignInForm: the page is a server component and can't call a
// function exported from a "use client" module.
export function linkErrorFrom(raw: string | string[] | undefined): boolean {
	const value = Array.isArray(raw) ? raw[0] : raw;
	return Boolean(value);
}
