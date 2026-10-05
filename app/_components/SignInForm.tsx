"use client";

import { useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { authClient } from "@/app/_lib/authClient";
import { MAGIC_LINK_TTL_MINUTES } from "@/app/_lib/constants/limits";
import styles from "./SignInForm.module.scss";

const LINK_ERROR_TEXT = "That link has expired or was already used. Send a new one.";
const RATE_LIMITED_TEXT = "Too many sign-in emails. Try again in an hour.";
const SEND_FAILED_TEXT = "We couldn't send the email. Try again.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type State =
	| { kind: "idle" }
	| { kind: "sending" }
	| { kind: "sent" }
	| { kind: "error"; message: string };

export default function SignInForm({ linkError }: { linkError: boolean }) {
	const [email, setEmail] = useState("");
	const [invalid, setInvalid] = useState(false);
	const [state, setState] = useState<State>(
		linkError ? { kind: "error", message: LINK_ERROR_TEXT } : { kind: "idle" },
	);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		// Better Auth rejects a padded address with a 400.
		const trimmed = email.trim();
		if (!EMAIL_PATTERN.test(trimmed)) {
			setInvalid(true);
			return;
		}
		setInvalid(false);
		setState({ kind: "sending" });
		try {
			const { error } = await authClient.signIn.magicLink({
				email: trimmed,
				callbackURL: "/",
				errorCallbackURL: "/sign-in",
			});
			if (!error) setState({ kind: "sent" });
			else setState({ kind: "error", message: error.status === 429 ? RATE_LIMITED_TEXT : SEND_FAILED_TEXT });
		} catch {
			setState({ kind: "error", message: SEND_FAILED_TEXT });
		}
	}

	if (state.kind === "sent") {
		return (
			<p role="status" className={styles.sent}>
				Check your email. The link works once and expires in {MAGIC_LINK_TTL_MINUTES} minutes.
			</p>
		);
	}

	const sending = state.kind === "sending";
	return (
		<form noValidate onSubmit={onSubmit} className={styles.form}>
			{state.kind === "error" && <Alert severity="error">{state.message}</Alert>}
			<TextField
				label="Email address"
				type="email"
				autoComplete="email"
				value={email}
				onChange={(e) => setEmail(e.target.value)}
				error={invalid}
				helperText={invalid ? "Enter a valid email address." : undefined}
				disabled={sending}
				fullWidth
			/>
			<Button type="submit" variant="contained" size="large" disabled={sending} className={styles.submit}>
				{sending ? "Sending…" : "Email me a sign-in link"}
			</Button>
		</form>
	);
}
