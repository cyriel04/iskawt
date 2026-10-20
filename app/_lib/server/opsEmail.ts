// Where ops notices go: new reports and new host applications. OPS_EMAIL_TO is
// the name; REPORTS_EMAIL_TO is its 6-2 predecessor, still read so nothing
// already configured stops working.

export function opsAddress(env: NodeJS.ProcessEnv): string | null {
	const address = (env.OPS_EMAIL_TO ?? env.REPORTS_EMAIL_TO ?? "").trim();
	return address || null;
}
