"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { productionTypeLabels } from "@/app/_lib/constants/labels";
import { shootDateRange, validateNewInquiry } from "@/app/_lib/inquiryValidation";
import { ProductionType } from "@/generated/prisma/enums";
import type {
	CreateInquiryResponse,
	InquiryApiError,
	InquiryFieldErrors,
} from "@/app/_lib/types";
import styles from "./InquiryForm.module.scss";

const OWN_SPACE_TEXT = "You can't send an inquiry about your own listing.";
const NOT_FOUND_TEXT = "This listing isn't taking inquiries right now.";
const RATE_LIMITED_TEXT = "You've sent a lot of inquiries today. Try again tomorrow.";
const SEND_FAILED_TEXT = "We couldn't send that. Try again.";
const SESSION_ENDED_TEXT = "Your session ended. Sign in again to send this.";

// Fields the form shows. A server field error on anything else (spaceSlug,
// website) has nowhere to go, so it falls back to the generic alert.
const VISIBLE_FIELDS = [
	"requesterName",
	"requesterCompany",
	"shootDate",
	"durationHours",
	"crewSize",
	"productionType",
	"budgetNote",
	"message",
] as const;

const PRODUCTION_TYPES = Object.values(ProductionType);

type Props = { spaceSlug: string; hostName: string; respondsInHours: number | null; today: string };

type State =
	| { kind: "idle" }
	| { kind: "sending" }
	| { kind: "sent"; response: CreateInquiryResponse }
	| { kind: "error"; message: string }
	| { kind: "signed-out" };

function sentText({ id, reused }: CreateInquiryResponse, hostName: string, respondsInHours: number | null): string {
	if (id === null) return "Sent.";
	if (reused) {
		return "Added to your existing conversation. Dates, hours and crew size there weren't changed. Mention any changes in your message.";
	}
	if (respondsInHours === null) return `Sent. We'll email you when ${hostName} replies.`;
	const hours = respondsInHours === 1 ? "1 hour" : `${respondsInHours} hours`;
	return `Sent. ${hostName} usually replies within ${hours}. We'll email you when they do.`;
}

function errorText(error: InquiryApiError["error"] | undefined): string {
	switch (error) {
		case "OWN_SPACE":
			return OWN_SPACE_TEXT;
		case "NOT_FOUND":
			return NOT_FOUND_TEXT;
		case "RATE_LIMITED":
			return RATE_LIMITED_TEXT;
		default:
			return SEND_FAILED_TEXT;
	}
}

export default function InquiryForm({ spaceSlug, hostName, respondsInHours, today }: Props) {
	const [requesterName, setRequesterName] = useState("");
	const [requesterCompany, setRequesterCompany] = useState("");
	const [shootDate, setShootDate] = useState("");
	const [durationHours, setDurationHours] = useState("");
	const [crewSize, setCrewSize] = useState("");
	const [productionType, setProductionType] = useState<ProductionType>("FILM");
	const [budgetNote, setBudgetNote] = useState("");
	const [message, setMessage] = useState("");
	const [website, setWebsite] = useState("");
	const [fieldErrors, setFieldErrors] = useState<InquiryFieldErrors>({});
	const [state, setState] = useState<State>({ kind: "idle" });
	const statusRef = useRef<HTMLParagraphElement>(null);

	const sent = state.kind === "sent";
	const sending = state.kind === "sending";
	const { min, max } = shootDateRange(today);
	const signInHref = `/sign-in?next=${encodeURIComponent(`/spaces/${spaceSlug}`)}`;

	// The form unmounts on "sent"; without this, focus drops to <body>.
	useEffect(() => {
		if (sent) statusRef.current?.focus();
	}, [sent]);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		// Numbers stay strings: the shared validator parses them, exactly as the
		// route handler does.
		const input = {
			spaceSlug,
			requesterName,
			requesterCompany,
			shootDate,
			durationHours,
			crewSize,
			productionType,
			budgetNote,
			message,
			website,
		};
		const checked = validateNewInquiry(input, today);
		if (!checked.ok) {
			setFieldErrors(checked.errors);
			setState({ kind: "idle" });
			return;
		}
		setFieldErrors({});
		setState({ kind: "sending" });
		try {
			const res = await fetch("/api/inquiries", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			if (res.status === 200 || res.status === 201) {
				const body: CreateInquiryResponse = await res.json();
				setState({ kind: "sent", response: body });
				return;
			}
			const body: Partial<InquiryApiError> = await res.json().catch(() => ({}));
			if (res.status === 401 || body.error === "UNAUTHENTICATED") {
				setState({ kind: "signed-out" });
				return;
			}
			const shown = VISIBLE_FIELDS.filter((key) => body.fields?.[key]);
			if (body.error === "VALIDATION" && body.fields && shown.length > 0) {
				setFieldErrors(body.fields);
				setState({ kind: "idle" });
				return;
			}
			setState({ kind: "error", message: errorText(body.error) });
		} catch {
			setState({ kind: "error", message: SEND_FAILED_TEXT });
		}
	}

	const field = (key: (typeof VISIBLE_FIELDS)[number]) => ({
		name: key,
		error: Boolean(fieldErrors[key]),
		helperText: fieldErrors[key],
		disabled: sending,
		fullWidth: true,
	});

	return (
		<div className={styles.root}>
			{/* Rendered empty from first paint: a live region that arrives already
			    filled is not announced by some screen readers. */}
			<p role="status" ref={statusRef} tabIndex={-1} className={sent ? styles.sent : styles.status}>
				{state.kind === "sent" && (
					<>
						{sentText(state.response, hostName, respondsInHours)}
						{state.response.id !== null && (
							<>
								{" "}
								<Link href={`/inbox/${state.response.id}`} className={styles.link}>
									View conversation
								</Link>
							</>
						)}
					</>
				)}
			</p>
			{!sent && (
				<form noValidate onSubmit={onSubmit} className={styles.form}>
					{state.kind === "error" && <Alert severity="error">{state.message}</Alert>}
					{state.kind === "signed-out" && (
						<Alert severity="error">
							{SESSION_ENDED_TEXT}{" "}
							<Link href={signInHref} className={styles.link}>
								Sign in again
							</Link>
						</Alert>
					)}
					<TextField
						label="Your name"
						autoComplete="name"
						value={requesterName}
						onChange={(e) => setRequesterName(e.target.value)}
						{...field("requesterName")}
					/>
					<TextField
						label="Company (optional)"
						autoComplete="organization"
						value={requesterCompany}
						onChange={(e) => setRequesterCompany(e.target.value)}
						{...field("requesterCompany")}
					/>
					<TextField
						label="Shoot date (optional)"
						type="date"
						value={shootDate}
						onChange={(e) => setShootDate(e.target.value)}
						slotProps={{ inputLabel: { shrink: true }, htmlInput: { min, max } }}
						{...field("shootDate")}
					/>
					<div className={styles.pair}>
						<TextField
							label="Hours needed (optional)"
							slotProps={{ htmlInput: { inputMode: "numeric" } }}
							value={durationHours}
							onChange={(e) => setDurationHours(e.target.value)}
							{...field("durationHours")}
						/>
						<TextField
							label="Crew size (optional)"
							slotProps={{ htmlInput: { inputMode: "numeric" } }}
							value={crewSize}
							onChange={(e) => setCrewSize(e.target.value)}
							{...field("crewSize")}
						/>
					</div>
					<TextField
						select
						label="Production type"
						value={productionType}
						onChange={(e) => {
							const next = PRODUCTION_TYPES.find((type) => type === e.target.value);
							if (next) setProductionType(next);
						}}
						{...field("productionType")}
					>
						{PRODUCTION_TYPES.map((type) => (
							<MenuItem key={type} value={type}>
								{productionTypeLabels[type]}
							</MenuItem>
						))}
					</TextField>
					<TextField
						label="Budget note (optional)"
						value={budgetNote}
						onChange={(e) => setBudgetNote(e.target.value)}
						{...field("budgetNote")}
					/>
					<TextField
						label="Message"
						multiline
						minRows={4}
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						{...field("message")}
					/>
					{/* Spam trap. People never see it; bots fill it in. */}
					<div aria-hidden="true" className={styles.trap}>
						<label htmlFor="inquiry-website">Leave this empty</label>
						<input
							id="inquiry-website"
							name="website"
							type="text"
							tabIndex={-1}
							autoComplete="off"
							value={website}
							onChange={(e) => setWebsite(e.target.value)}
						/>
					</div>
					<Button type="submit" variant="contained" size="large" disabled={sending} className={styles.submit}>
						{sending ? "Sending…" : "Send inquiry"}
					</Button>
				</form>
			)}
		</div>
	);
}
