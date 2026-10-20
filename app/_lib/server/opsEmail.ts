// Where ops notices go: new reports and new host applications. OPS_EMAIL_TO is
// the name; REPORTS_EMAIL_TO is its 6-2 predecessor, still read so nothing
// already configured stops working. An empty or blank OPS_EMAIL_TO (as
// .env.example ships it) counts as unset, so the fallback still applies.

export function opsAddress(env: NodeJS.ProcessEnv): string | null {
	return env.OPS_EMAIL_TO?.trim() || env.REPORTS_EMAIL_TO?.trim() || null;
}
