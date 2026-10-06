// Outgoing email. Resend's HTTP API via fetch in production (no SDK), the
// console in development. Tests construct mailers directly.

export type MailMessage = { to: string; subject: string; text: string; html: string };

export interface Mailer {
	send(message: MailMessage): Promise<void>;
}

export class ResendMailer implements Mailer {
	constructor(
		private readonly apiKey: string,
		private readonly from: string,
		private readonly fetchImpl: typeof fetch = fetch,
	) {}

	async send(message: MailMessage): Promise<void> {
		const response = await this.fetchImpl("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				from: this.from,
				to: [message.to],
				subject: message.subject,
				text: message.text,
				html: message.html,
			}),
			// Bounded so a hung request can't keep after() alive.
			signal: AbortSignal.timeout(10_000),
		});
		// Never include the recipient or body: errors end up in logs.
		if (!response.ok) throw new Error(`Resend responded ${response.status}`);
	}
}

// Development only. Prints the message so the sign-in link can be clicked
// from the terminal. getMailer never returns this in production.
export class ConsoleMailer implements Mailer {
	async send(message: MailMessage): Promise<void> {
		console.info(`[dev mail] ${message.subject}\n${message.text}`);
	}
}

export function getMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
	if (env.RESEND_API_KEY && env.EMAIL_FROM) return new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM);
	if (env.NODE_ENV === "production") throw new Error("RESEND_API_KEY and EMAIL_FROM are required in production");
	return new ConsoleMailer();
}
