"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ReportDialog from "@/app/_components/ReportDialog";
import ThreadMenu from "@/app/_components/ThreadMenu";
import { formatSentAt, isOpenStatus, mergeMessages, pollCursor } from "@/app/_components/threadMessages";
import { THREAD_POLL_SECONDS } from "@/app/_lib/constants/inquiries";
import { validateMessageBody } from "@/app/_lib/inquiryValidation";
import type {
	BlockResponse,
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
const NOT_LINKED_TEXT = "You can block this host once they've joined Iskawt.";

type AlertState =
	| { kind: "session" }
	| { kind: "gone" }
	| { kind: "closed-on-send" }
	| { kind: "text"; text: string }
	| null;

type Action = "close" | "decline" | "block";

function confirmCopy(action: Action, name: string): { question: string; yes: string } {
	switch (action) {
		case "close":
			return { question: "Close this conversation? Neither of you can send more messages.", yes: "Yes, close it" };
		case "decline":
			return { question: "Decline this inquiry? The renter will see it's declined and can't reply.", yes: "Yes, decline" };
		case "block":
			return {
				question: `Block ${name}? Neither of you will be able to send messages in your conversations, and they won't be able to send you new inquiries. They won't be told.`,
				yes: `Yes, block ${name}`,
			};
	}
}

// The live part of a thread: messages, the poller, the reply box, the status
// actions and the safety menu. Whether you can write is the server's call
// (canReply, refreshed by every poll); a block you made is shown as such, any
// other read-only state reads as "closed", so nobody learns they were blocked.
export default function ThreadView({ thread }: { thread: InquiryThread }) {
	const { id } = thread;
	const router = useRouter();
	const [messages, setMessages] = useState<InquiryMessage[]>(thread.messages);
	const [status, setStatus] = useState<InquiryStatus>(thread.status);
	const [draft, setDraft] = useState("");
	const [fieldError, setFieldError] = useState<string | null>(null);
	const [alert, setAlert] = useState<AlertState>(null);
	const [sending, setSending] = useState(false);
	const [acting, setActing] = useState(false);
	const [confirming, setConfirming] = useState<Action | null>(null);
	const [stopped, setStopped] = useState(false);
	const [sendable, setSendable] = useState(thread.canReply);
	const [blockedByMe, setBlockedByMe] = useState(thread.blockedByMe);
	const [reporting, setReporting] = useState(false);

	const messagesRef = useRef(messages);
	const inFlight = useRef(false);
	const lastMessageRef = useRef<HTMLLIElement>(null);
	const shownCount = useRef(messages.length);
	const confirmRef = useRef<HTMLButtonElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const declineRef = useRef<HTMLButtonElement>(null);
	const returnFocusTo = useRef<Action | null>(null);
	const closedRef = useRef<HTMLParagraphElement>(null);
	const focusClosed = useRef(false);
	const refreshedFor = useRef<InquiryStatus>(thread.status);
	const pollNow = useRef<(() => Promise<void>) | null>(null);
	const moreRef = useRef<HTMLButtonElement>(null);
	const blockedRef = useRef<HTMLParagraphElement>(null);
	const focusBlocked = useRef(false);
	const focusMore = useRef(false);

	// statusOpen keeps the poller running while a block or an unverified host
	// makes the thread read-only, so it notices when that lifts.
	const statusOpen = isOpenStatus(status);
	const open = statusOpen && sendable;
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
			const target = returnFocusTo.current === "close" ? closeRef : returnFocusTo.current === "decline" ? declineRef : moreRef;
			target.current?.focus();
			returnFocusTo.current = null;
		}
	}, [confirming]);

	// The server-rendered summary above shows the status too. Refresh it when
	// the live status moves on; once per status, as the prop catches up after.
	useEffect(() => {
		if (status === thread.status || refreshedFor.current === status) return;
		refreshedFor.current = status;
		router.refresh();
	}, [status, thread.status, router]);

	// After a confirmed Close/Decline the buttons go; focus the notice instead.
	useEffect(() => {
		if (!open && focusClosed.current) {
			focusClosed.current = false;
			closedRef.current?.focus();
		}
	}, [open]);

	// After a confirmed block, focus the notice that replaced the reply box.
	useEffect(() => {
		if (blockedByMe && focusBlocked.current) {
			focusBlocked.current = false;
			blockedRef.current?.focus();
		}
	}, [blockedByMe]);

	// After unblocking, give focus back to More, once it's enabled again
	// (it's disabled while the request is in flight). After the report dialog,
	// likewise once it has closed: focusing More from its onClose would lose to
	// the dialog's focus trap, which is still active then.
	useEffect(() => {
		if (!acting && !reporting && focusMore.current) {
			focusMore.current = false;
			moreRef.current?.focus();
		}
	}, [acting, reporting]);

	useEffect(() => {
		if (!statusOpen || stopped) return;
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
					setSendable(data.canReply);
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

		pollNow.current = poll;
		const timer = setInterval(() => {
			if (document.visibilityState === "visible") void poll();
		}, THREAD_POLL_SECONDS * 1000);
		const onVisibility = () => {
			if (document.visibilityState === "visible") void poll();
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			cancelled = true;
			pollNow.current = null;
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [id, statusOpen, stopped]);

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
				// Closed or declined: the poll brings back which.
				setAlert({ kind: "closed-on-send" });
				void pollNow.current?.();
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

	async function onStatusChange(action: "close" | "decline") {
		setActing(true);
		try {
			const res = await fetch(`/api/inquiries/${id}/status`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action }),
			});
			if (res.status === 200) {
				const data: StatusResponse = await res.json();
				focusClosed.current = true;
				setStatus(data.status);
				setAlert(null);
			} else if (res.status === 409) {
				// Already closed or declined: the poll brings back which.
				focusClosed.current = true;
				void pollNow.current?.();
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

	async function onBlock() {
		setActing(true);
		try {
			const res = await fetch(`/api/inquiries/${id}/block`, { method: "POST" });
			if (res.status === 200) {
				const data: BlockResponse = await res.json();
				focusBlocked.current = data.blockedByMe;
				setBlockedByMe(data.blockedByMe);
				if (data.blockedByMe) setSendable(false);
				setAlert(null);
			} else if (res.status === 409) {
				setAlert({ kind: "text", text: NOT_LINKED_TEXT });
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

	// No confirmation: unblocking takes nothing away. The server decides whether
	// replies are allowed again (the other side may still block), so ask it.
	async function onUnblock() {
		setActing(true);
		try {
			const res = await fetch(`/api/inquiries/${id}/block`, { method: "DELETE" });
			if (res.status === 200) {
				const data: BlockResponse = await res.json();
				setBlockedByMe(data.blockedByMe);
				setAlert(null);
				focusMore.current = true;
				void pollNow.current?.();
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
		}
	}

	function onConfirm(action: Action) {
		if (action === "block") void onBlock();
		else void onStatusChange(action);
	}

	function onCancel() {
		returnFocusTo.current = confirming;
		setConfirming(null);
	}

	const closedOnSend = alert?.kind === "closed-on-send";
	const showBox = (open || closedOnSend) && !blockedByMe;

	return (
		<section aria-label="Conversation" className={styles.root}>
			<div className={styles.header}>
				<ThreadMenu
					counterpartName={thread.counterpartName}
					blockedByMe={blockedByMe}
					disabled={acting}
					triggerRef={moreRef}
					onReport={() => setReporting(true)}
					onBlock={() => setConfirming("block")}
					onUnblock={() => void onUnblock()}
				/>
			</div>
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

			{blockedByMe ? (
				<div className={styles.blocked}>
					<Typography ref={blockedRef} component="p" variant="body1" tabIndex={-1} className={styles.closed}>
						You blocked {thread.counterpartName}.
					</Typography>
					<Button variant="outlined" disabled={acting} onClick={() => void onUnblock()} className={styles.button}>
						Unblock
					</Button>
				</div>
			) : (
				!open &&
				!closedOnSend && (
					<Typography ref={closedRef} component="p" variant="body1" tabIndex={-1} className={styles.closed}>
						This conversation is closed.
					</Typography>
				)
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
						disabled={!open || closedOnSend}
					/>
					<Button type="submit" variant="contained" disabled={!open || closedOnSend || sending} className={styles.button}>
						{sending ? "Sending…" : "Send"}
					</Button>
				</form>
			)}

			{(open || confirming) && (
				<div className={styles.actions}>
					{confirming ? (
						<div role="group" aria-label="Confirm" className={styles.confirm}>
							<Typography component="p" variant="body1">
								{confirmCopy(confirming, thread.counterpartName).question}
							</Typography>
							<div className={styles.buttons}>
								<Button
									ref={confirmRef}
									variant="contained"
									color="error"
									disabled={acting}
									onClick={() => onConfirm(confirming)}
									className={styles.button}
								>
									{confirmCopy(confirming, thread.counterpartName).yes}
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
			<ReportDialog
				inquiryId={id}
				counterpartName={thread.counterpartName}
				open={reporting}
				onClose={() => {
					// The menu item that opened the dialog is gone; land on More.
					focusMore.current = true;
					setReporting(false);
				}}
				onBlocked={() => {
					setBlockedByMe(true);
					setSendable(false);
				}}
			/>
		</section>
	);
}
