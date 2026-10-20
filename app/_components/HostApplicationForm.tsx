"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { cityLabels, spaceTypeLabels } from "@/app/_lib/constants/labels";
import { validateNewHostApplication } from "@/app/_lib/hostApplicationValidation";
import { City, SpaceType } from "@/generated/prisma/enums";
import type { HostApplicationApiError, HostApplicationFieldErrors } from "@/app/_lib/types";
import styles from "./HostApplicationForm.module.scss";

const CITIES = Object.values(City);
const SPACE_TYPES = Object.values(SpaceType);
const SIGN_IN_HREF = `/sign-in?next=${encodeURIComponent("/list-your-space")}`;
const SEND_FAILED_TEXT = "We couldn't send that. Try again.";
const RATE_LIMITED_TEXT = "You've sent a lot of applications today. Try again tomorrow.";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "signed-out" } | { kind: "error"; message: string };

// "₱1,500" and " 1 500 " are how people write money; the validator wants digits.
const cleanRate = (value: string) => value.replace(/[₱,\s]/g, "");

// Apply to list a space. Nothing typed here is shown back: after sending, only
// the thanks with the user's own email. The address goes to the Iskawt team only.
export default function HostApplicationForm({ email }: { email: string }) {
	const [applicantName, setApplicantName] = useState("");
	const [spaceType, setSpaceType] = useState<SpaceType | "">("");
	const [city, setCity] = useState<City | "">("");
	const [areaName, setAreaName] = useState("");
	const [address, setAddress] = useState("");
	const [description, setDescription] = useState("");
	const [hourlyRate, setHourlyRate] = useState("");
	const [confirmsRightToList, setConfirms] = useState(false);
	const [website, setWebsite] = useState("");
	const [fieldErrors, setFieldErrors] = useState<HostApplicationFieldErrors>({});
	const [state, setState] = useState<State>({ kind: "idle" });
	const statusRef = useRef<HTMLParagraphElement>(null);

	const sent = state.kind === "sent";
	const sending = state.kind === "sending";

	// The form unmounts on "sent"; without this, focus drops to <body>.
	useEffect(() => {
		if (sent) statusRef.current?.focus();
	}, [sent]);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (sending) return;
		// The rate stays a string: the shared validator parses it, as the route does.
		const input = {
			applicantName,
			spaceType,
			city,
			areaName,
			address,
			description,
			hourlyRate: cleanRate(hourlyRate),
			confirmsRightToList,
			website,
		};
		const checked = validateNewHostApplication(input);
		if (!checked.ok) {
			setFieldErrors(checked.errors);
			setState({ kind: "idle" });
			return;
		}
		setFieldErrors({});
		setState({ kind: "sending" });
		try {
			const res = await fetch("/api/host-applications", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			if (res.status === 201) {
				setState({ kind: "sent" });
				return;
			}
			const body: Partial<HostApplicationApiError> = await res.json().catch(() => ({}));
			if (res.status === 401 || body.error === "UNAUTHENTICATED") setState({ kind: "signed-out" });
			else if (body.error === "VALIDATION" && body.fields && Object.keys(body.fields).length > 0) {
				setFieldErrors(body.fields);
				setState({ kind: "idle" });
			} else if (res.status === 429 || body.error === "RATE_LIMITED") setState({ kind: "error", message: RATE_LIMITED_TEXT });
			else setState({ kind: "error", message: SEND_FAILED_TEXT });
		} catch {
			setState({ kind: "error", message: SEND_FAILED_TEXT });
		}
	}

	const field = (key: keyof HostApplicationFieldErrors, hint?: string) => ({
		name: key,
		error: Boolean(fieldErrors[key]),
		helperText: fieldErrors[key] ?? hint,
		disabled: sending,
		fullWidth: true,
	});

	return (
		<div className={styles.root}>
			{/* Rendered empty from first paint: a live region that arrives already
			    filled is not announced by some screen readers. */}
			<p role="status" ref={statusRef} tabIndex={-1} className={sent ? styles.sent : styles.status}>
				{sent && `Thanks. We'll email you at ${email} after we've had a look.`}
			</p>
			{!sent && (
				<form noValidate onSubmit={onSubmit} className={styles.form}>
					{state.kind === "error" && <Alert severity="error">{state.message}</Alert>}
					{state.kind === "signed-out" && (
						<Alert severity="error">
							Your session ended.{" "}
							<Link href={SIGN_IN_HREF} className={styles.link}>
								Sign in again
							</Link>
						</Alert>
					)}
					<TextField
						label="Your name or business name"
						autoComplete="name"
						value={applicantName}
						onChange={(e) => setApplicantName(e.target.value)}
						{...field("applicantName")}
					/>
					<div className={styles.pair}>
						<TextField
							select
							label="Space type"
							value={spaceType}
							onChange={(e) => {
								const next = SPACE_TYPES.find((type) => type === e.target.value);
								if (next) setSpaceType(next);
							}}
							{...field("spaceType")}
						>
							{SPACE_TYPES.map((type) => (
								<MenuItem key={type} value={type}>
									{spaceTypeLabels[type]}
								</MenuItem>
							))}
						</TextField>
						<TextField
							select
							label="City"
							value={city}
							onChange={(e) => {
								const next = CITIES.find((c) => c === e.target.value);
								if (next) setCity(next);
							}}
							{...field("city")}
						>
							{CITIES.map((c) => (
								<MenuItem key={c} value={c}>
									{cityLabels[c]}
								</MenuItem>
							))}
						</TextField>
					</div>
					<TextField label="Area" value={areaName} onChange={(e) => setAreaName(e.target.value)} {...field("areaName", "Like Poblacion or Kapitolyo.")} />
					<TextField
						label="Address"
						autoComplete="street-address"
						multiline
						minRows={2}
						value={address}
						onChange={(e) => setAddress(e.target.value)}
						{...field("address", "Only the Iskawt team sees this. Listings show just the area and city.")}
					/>
					<TextField
						label="About the space"
						multiline
						minRows={4}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						{...field("description")}
					/>
					<TextField
						label="Hourly rate (optional)"
						slotProps={{ htmlInput: { inputMode: "numeric" } }}
						value={hourlyRate}
						onChange={(e) => setHourlyRate(e.target.value)}
						{...field("hourlyRate", "Indicative, in pesos per hour. Nothing is charged here.")}
					/>
					<FormControl error={Boolean(fieldErrors.confirmsRightToList)}>
						<FormControlLabel
							control={<Checkbox checked={confirmsRightToList} onChange={(e) => setConfirms(e.target.checked)} disabled={sending} />}
							label="This space is mine to list, or I have the owner's permission."
							className={styles.check}
						/>
						{fieldErrors.confirmsRightToList && <FormHelperText>{fieldErrors.confirmsRightToList}</FormHelperText>}
					</FormControl>
					{/* Spam trap. People never see it; bots fill it in. */}
					<div aria-hidden="true" className={styles.trap}>
						<label htmlFor="application-website">Leave this empty</label>
						<input
							id="application-website"
							name="website"
							type="text"
							tabIndex={-1}
							autoComplete="off"
							value={website}
							onChange={(e) => setWebsite(e.target.value)}
						/>
					</div>
					<Button type="submit" variant="contained" size="large" disabled={sending} className={styles.submit}>
						{sending ? "Sending…" : "Send application"}
					</Button>
				</form>
			)}
		</div>
	);
}
