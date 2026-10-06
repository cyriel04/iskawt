"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { formatSentAt, isOpenStatus, mergeMessages, pollCursor } from "@/app/_components/threadMessages";
import { THREAD_POLL_SECONDS } from "@/app/_lib/constants/inquiries";
import { validateMessageBody } from "@/app/_lib/inquiryValidation";
import type {
	InquiryMessage,
	InquiryStatus,
	InquiryThread,
	MessagesResponse,
	PostMessageResponse,
	StatusResponse,
} from "@/app/_lib/types";
import styles from "./ThreadView.module.scss";

const RATE_LIMITED_TEXT = "You've sent a lot of messages. Try again later.";
const SEND_FAILED_TEXT = "We couldn't send that. Try again.";
const STATUS_FAILED_TEXT = "We couldn't update this conversation. Try again.";

type AlertState =
	| { kind: "session" }
	| { kind: "gone" }
	| { kind: "closed-on-send" }
	| { kind: "text"; text: string }
	| null;

type Action = "close" | "decline";

const CONFIRM: Record<Action, { question: string; yes: string }> = {
	close: { question: "Close this conversation? Neither of you can send more messages.", yes: "Yes, close it" },
	decline: { question: "Decline this inquiry? The renter will see it's declined and can't reply.", yes: "Yes, decline" },
};

// The live part of a thread: messages, the poller, the reply box and the
// status actions. The status in state is the source of truth once it changes;
// the server's can* flags only describe the first render.
export default function ThreadView({ thread }: { thread: InquiryThread }) {
	const { id } = thread;
	const [messages, setMessages] = useState<InquiryMessage[]>(thread.messages);
	const [status, setStatus] = useState<InquiryStatus>(thread.status);
	const [draft, setDraft] = useState("");
	const [fieldError, setFieldError] = useState<string | null>(null);
	const [alert, setAlert] = useState<AlertState>(null);
	const [sending, setSending] = useState(false);
	const [acting, setActing] = useState(false);
	const [confirming, setConfirming] = useState<Action | null>(null);
	const [stopped, setStopped] = useState(false);

	const messagesRef = useRef(messages);
	const inFlight = useRef(false);
	const lastMessageRef = useRef<HTMLLIElement>(null);
	const shownCount = useRef(messages.length);
	const confirmRef = useRef<HTMLButtonElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const declineRef = useRef<HTMLButtonElement>(null);
	const returnFocusTo = useRef<Action | null>(null);

	const open = isOpenStatus(status);
	const canDecline = open && thread.role === "HOST";
	const canClose = open;
	const signInHref = `/sign-in?next=${encodeURIComponent(`/inbox/${id}`)}`;

	// The interval reads the latest messages through this ref.
	useEffect(() => {
		messagesRef.current = messages;
		if (messages.length > shownCount.current) lastMessageRef.current?.scrollIntoView?.({ block: "nearest" });
		shownCount.current = messages.length;
	}, [messages]);

	// Focus the confirm button when the confirmation appears; give it back to
	// the button that opened it on Cancel.
	useEffect(() => {
		if (confirming) {
			confirmRef.current?.focus();
		} else if (returnFocusTo.current) {
			(returnFocusTo.current === "close" ? closeRef : declineRef).current?.focus();
			returnFocusTo.current = null;
		}
	}, [confirming]);

	useEffect(() => {
		if (!open || stopped) return;
		let cancelled = false;

		async function poll() {
			if (inFlight.current) return;
			inFlight.current = true;
			try {
				const cursor = pollCursor(messagesRef.current);
				const res = await fetch(`/api/inquiries/${id}/messages${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`, {
					cache: "no-store",
				});
				if (cancelled) return;
				if (res.status === 200) {
					const data: MessagesResponse = await res.json();
					if (cancelled) return;
					setMessages((prev) => mergeMessages(prev, data.messages));
					setStatus(data.status);
				} else if (res.status === 401) {
					setAlert({ kind: "session" });
					setStopped(true);
				} else if (res.status === 404) {
					setAlert({ kind: "gone" });
					setStopped(true);
				}
				// Anything else: the next tick retries.
			} catch {
				// Network error: the next tick retries.
			} finally {
				inFlight.current = false;
			}
		}

		const timer = setInterval(() => {
			if (document.visibilityState === "visible") void poll();
		}, THREAD_POLL_SECONDS * 1000);
		const onVisibility = () => {
			if (document.visibilityState === "visible") void poll();
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			cancelled = true;
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [id, open, stopped]);

	async function onSend(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const checked = validateMessageBody(draft);
		if (!checked.ok) {
			setFieldError(checked.error);
			return;
		}
		setFieldError(null);
		setAlert(null);
		setSending(true);
		try {
			const res = await fetch(`/api/inquiries/${id}/messages`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: checked.value }),
			});
			if (res.status === 201) {
				const data: PostMessageResponse = await res.json();
				setMessages((prev) => mergeMessages(prev, [data.message]));
				setDraft("");
			} else if (res.status === 409) {
				setAlert({ kind: "closed-on-send" });
				setStatus("CLOSED");
			} else if (res.status === 401) {
				setAlert({ kind: "session" });
				setStopped(true);
			} else if (res.status === 404) {
				setAlert({ kind: "gone" });
				setStopped(true);
			} else if (res.status === 429) {
				setAlert({ kind: "text", text: RATE_LIMITED_TEXT });
			} else {
				setAlert({ kind: "text", text: SEND_FAILED_TEXT });
			}
		} catch {
			setAlert({ kind: "text", text: SEND_FAILED_TEXT });
		} finally {
			setSending(false);
		}
	}

	async function onConfirm(action: Action) {
		setActing(true);
		try {
			const res = await fetch(`/api/inquiries/${id}/status`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action }),
			});
			if (res.status === 200) {
				const data: StatusResponse = await res.json();
				setStatus(data.status);
				setAlert(null);
			} else if (res.status === 409) {
				setStatus("CLOSED");
			} else if (res.status === 401) {
				setAlert({ kind: "session" });
				setStopped(true);
			} else if (res.status === 404) {
				setAlert({ kind: "gone" });
				setStopped(true);
			} else {
				setAlert({ kind: "text", text: STATUS_FAILED_TEXT });
			}
		} catch {
			setAlert({ kind: "text", text: STATUS_FAILED_TEXT });
		} finally {
			setActing(false);
			setConfirming(null);
		}
	}

	function onCancel() {
		returnFocusTo.current = confirming;
		setConfirming(null);
	}

	const showBox = open || alert?.kind === "closed-on-send";

	return (
		<section aria-label="Conversation" className={styles.root}>
			<ol aria-label="Messages" className={styles.messages}>
				{messages.map((message, index) => (
					<li
						key={message.id}
						ref={index === messages.length - 1 ? lastMessageRef : undefined}
						className={message.fromMe ? `${styles.message} ${styles.fromMe}` : styles.message}
					>
						<span className={styles.meta}>
							<Typography component="span" variant="bodyStrong">
								{message.senderName}
							</Typography>
							<Typography component="time" variant="caption" dateTime={message.sentAt} className={styles.time}>
								{formatSentAt(message.sentAt)}
							</Typography>
						</span>
						<Typography component="p" variant="body1" className={styles.body}>
							{message.body}
						</Typography>
					</li>
				))}
			</ol>

			{alert && (
				<Alert severity={alert.kind === "closed-on-send" ? "info" : "error"}>
					{alert.kind === "session" && (
						<>
							Your session ended.{" "}
							<Link href={signInHref} className={styles.link}>
								Sign in again
							</Link>
						</>
					)}
					{alert.kind === "gone" && (
						<>
							This conversation is no longer available.{" "}
							<Link href="/inbox" className={styles.link}>
								Go to your inbox
							</Link>
						</>
					)}
					{alert.kind === "closed-on-send" && "This conversation was closed."}
					{alert.kind === "text" && alert.text}
				</Alert>
			)}

			{!open && (
				<Typography component="p" variant="body1" className={styles.closed}>
					This conversation is closed.
				</Typography>
			)}

			{showBox && (
				<form aria-label={`Reply to ${thread.counterpartName}`} noValidate onSubmit={onSend} className={styles.form}>
					<TextField
						label="Reply"
						name="body"
						multiline
						minRows={3}
						fullWidth
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						error={Boolean(fieldError)}
						helperText={fieldError}
						disabled={!open}
					/>
					<Button type="submit" variant="contained" disabled={!open || sending} className={styles.button}>
						{sending ? "Sending…" : "Send"}
					</Button>
				</form>
			)}

			{open && (
				<div className={styles.actions}>
					{confirming ? (
						<div role="group" aria-label="Confirm" className={styles.confirm}>
							<Typography component="p" variant="body1">
								{CONFIRM[confirming].question}
							</Typography>
							<div className={styles.buttons}>
								<Button
									ref={confirmRef}
									variant="contained"
									color="error"
									disabled={acting}
									onClick={() => void onConfirm(confirming)}
									className={styles.button}
								>
									{CONFIRM[confirming].yes}
								</Button>
								<Button variant="text" disabled={acting} onClick={onCancel} className={styles.button}>
									Cancel
								</Button>
							</div>
						</div>
					) : (
						<div className={styles.buttons}>
							{canDecline && (
								<Button ref={declineRef} variant="outlined" onClick={() => setConfirming("decline")} className={styles.button}>
									Decline
								</Button>
							)}
							{canClose && (
								<Button ref={closeRef} variant="outlined" onClick={() => setConfirming("close")} className={styles.button}>
									Close conversation
								</Button>
							)}
						</div>
					)}
				</div>
			)}
		</section>
	);
}
