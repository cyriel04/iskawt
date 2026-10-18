import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { REPORT_DETAIL_MAX } from "@/app/_lib/constants/inquiries";
import { reportReasonLabels } from "@/app/_lib/constants/labels";
import { validateNewReport } from "@/app/_lib/reportValidation";
import { ReportReason } from "@/generated/prisma/enums";
import type { BlockResponse, ReportApiError, ReportFieldErrors } from "@/app/_lib/types";
import styles from "./ReportDialog.module.scss";

const REASONS = Object.values(ReportReason);
const THANKS_TEXT = "Thanks. Someone from Iskawt will look at this.";
const RATE_LIMITED_TEXT = "You've sent a lot of reports today. Try again tomorrow.";
const GONE_TEXT = "This conversation is no longer available.";
const FAILED_TEXT = "We couldn't send that report. Try again.";
const NOT_LINKED_TEXT = "You can block this host once they've joined Iskawt.";
const blockFailedText = (name: string) => `We couldn't block ${name}. You can try again from the More menu.`;

type Props = {
	inquiryId: string;
	counterpartName: string;
	blockedByMe: boolean;
	open: boolean;
	onClose: () => void;
	onBlocked: () => void;
};

type Notice = { text: string; signIn: boolean } | null;
type Phase = { kind: "form" } | { kind: "sent"; note: string | null };

// Report a conversation, and optionally block the other person in the same go.
// The report and the block are two requests: a failed block never undoes a
// sent report, it only adds a note.
export default function ReportDialog({ inquiryId, counterpartName, blockedByMe, open, onClose, onBlocked }: Props) {
	const titleId = useId();
	const reasonErrorId = useId();
	const thanksRef = useRef<HTMLParagraphElement>(null);
	const [reason, setReason] = useState<ReportReason | "">("");
	const [detail, setDetail] = useState("");
	const [alsoBlock, setAlsoBlock] = useState(false);
	const [errors, setErrors] = useState<ReportFieldErrors>({});
	const [notice, setNotice] = useState<Notice>(null);
	const [sending, setSending] = useState(false);
	const [phase, setPhase] = useState<Phase>({ kind: "form" });
	const sent = phase.kind === "sent";
	const signInHref = `/sign-in?next=${encodeURIComponent(`/inbox/${inquiryId}`)}`;

	// The form unmounts on "sent"; without this, focus drops to <body>.
	useEffect(() => {
		if (sent) thanksRef.current?.focus();
	}, [sent]);

	function close() {
		onClose();
		setReason("");
		setDetail("");
		setAlsoBlock(false);
		setErrors({});
		setNotice(null);
		setPhase({ kind: "form" });
	}

	async function block(): Promise<string | null> {
		try {
			const res = await fetch(`/api/inquiries/${inquiryId}/block`, { method: "POST" });
			if (res.status === 200) {
				const data: BlockResponse = await res.json();
				if (!data.blockedByMe) return null;
				onBlocked();
				return `You blocked ${counterpartName}.`;
			}
			return res.status === 409 ? NOT_LINKED_TEXT : blockFailedText(counterpartName);
		} catch {
			return blockFailedText(counterpartName);
		}
	}

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (sending) return;
		const checked = validateNewReport({ reason, detail });
		if (!checked.ok) {
			setErrors(checked.errors);
			return;
		}
		setErrors({});
		setNotice(null);
		setSending(true);
		try {
			const res = await fetch(`/api/inquiries/${inquiryId}/report`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(checked.value),
			});
			if (res.status === 201) {
				const note = alsoBlock ? await block() : null;
				setPhase({ kind: "sent", note });
				return;
			}
			const body: Partial<ReportApiError> = await res.json().catch(() => ({}));
			if (res.status === 400 && body.fields) setErrors(body.fields);
			else if (res.status === 401) setNotice({ text: "Your session ended.", signIn: true });
			else if (res.status === 404) setNotice({ text: GONE_TEXT, signIn: false });
			else if (res.status === 429) setNotice({ text: RATE_LIMITED_TEXT, signIn: false });
			else setNotice({ text: FAILED_TEXT, signIn: false });
		} catch {
			setNotice({ text: FAILED_TEXT, signIn: false });
		} finally {
			setSending(false);
		}
	}

	return (
		<Dialog open={open} onClose={sending ? undefined : close} aria-labelledby={titleId} fullWidth maxWidth="sm">
			<DialogTitle id={titleId}>Report conversation</DialogTitle>
			{phase.kind === "sent" ? (
				<>
					<DialogContent className={styles.content}>
						<Typography ref={thanksRef} component="p" variant="body1" role="status" tabIndex={-1}>
							{THANKS_TEXT}
						</Typography>
						{phase.note && <Alert severity="info">{phase.note}</Alert>}
					</DialogContent>
					<DialogActions>
						<Button variant="contained" onClick={close} className={styles.button}>
							Done
						</Button>
					</DialogActions>
				</>
			) : (
				<form noValidate onSubmit={onSubmit} aria-labelledby={titleId}>
					<DialogContent className={styles.content}>
						<Typography component="p" variant="body1" className={styles.lead}>
							Reports go to the Iskawt team. {counterpartName} isn&apos;t told.
						</Typography>
						<FormControl component="fieldset" error={Boolean(errors.reason)}>
							<FormLabel component="legend">Reason</FormLabel>
							<RadioGroup
								name="reason"
								aria-describedby={errors.reason ? reasonErrorId : undefined}
								value={reason}
								onChange={(e) => {
									const next = REASONS.find((r) => r === e.target.value);
									if (next) setReason(next);
								}}
							>
								{REASONS.map((r) => (
									<FormControlLabel key={r} value={r} control={<Radio />} label={reportReasonLabels[r]} className={styles.option} />
								))}
							</RadioGroup>
							{errors.reason && <FormHelperText id={reasonErrorId}>{errors.reason}</FormHelperText>}
						</FormControl>
						<TextField
							label="Details (optional)"
							name="detail"
							multiline
							minRows={3}
							fullWidth
							value={detail}
							onChange={(e) => setDetail(e.target.value)}
							error={Boolean(errors.detail)}
							helperText={errors.detail ?? `${[...detail].length}/${REPORT_DETAIL_MAX}`}
						/>
						{!blockedByMe && (
							<FormControlLabel
								control={<Checkbox checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />}
								label={`Also block ${counterpartName}`}
								className={styles.option}
							/>
						)}
						{notice && (
							<Alert severity="error">
								{notice.text}
								{notice.signIn && (
									<>
										{" "}
										<Link href={signInHref} className={styles.link}>
											Sign in again
										</Link>
									</>
								)}
							</Alert>
						)}
					</DialogContent>
					<DialogActions>
						<Button variant="text" onClick={close} disabled={sending} className={styles.button}>
							Cancel
						</Button>
						<Button type="submit" variant="contained" disabled={sending} className={styles.button}>
							{sending ? "Sending…" : "Send report"}
						</Button>
					</DialogActions>
				</form>
			)}
		</Dialog>
	);
}
