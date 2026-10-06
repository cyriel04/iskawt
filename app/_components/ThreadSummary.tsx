import Link from "next/link";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { locationLine } from "@/app/_components/labels";
import { inquiryStatusLabels, productionTypeLabels } from "@/app/_lib/constants/labels";
import type { InquiryThread } from "@/app/_lib/types";
import styles from "./ThreadSummary.module.scss";

const calendar = new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

// "2026-10-20" → "20 Oct 2026". A calendar date, not an instant: read and
// formatted in UTC so no zone can shift the day. Built from parts so the order
// doesn't depend on the ICU version's en-PH pattern.
function formatShootDate(value: string): string {
	const [y, m, d] = value.split("-").map(Number);
	const parts = calendar.formatToParts(new Date(Date.UTC(y, m - 1, d)));
	const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
	return `${part("day")} ${part("month")} ${part("year")}`;
}

// Server component: the static head of a thread. Names, area and city only.
export default function ThreadSummary({ thread }: { thread: InquiryThread }) {
	const { space } = thread;
	return (
		<header className={styles.root}>
			<div className={styles.titleRow}>
				<Typography variant="displayLg" component="h1">
					{space.title}
				</Typography>
				<Chip label={inquiryStatusLabels[thread.status]} size="small" variant="outlined" />
			</div>
			<Typography variant="body1" className={styles.subline}>
				With {thread.counterpartName} · {locationLine(space.areaName, space.city)}
			</Typography>
			<Link href={`/spaces/${space.slug}`} className={styles.link}>
				View listing
			</Link>
			<ul aria-label="Inquiry details" className={styles.details}>
				{thread.shootDate !== null && (
					<li>
						<span className={styles.label}>Shoot date</span> {formatShootDate(thread.shootDate)}
					</li>
				)}
				{thread.durationHours !== null && (
					<li>{thread.durationHours === 1 ? "1 hour" : `${thread.durationHours} hours`}</li>
				)}
				{thread.crewSize !== null && <li>Crew of {thread.crewSize}</li>}
				<li>{productionTypeLabels[thread.productionType]}</li>
				{thread.budgetNote !== null && <li>Budget: {thread.budgetNote}</li>}
				{thread.role === "HOST" && thread.requesterCompany !== null && (
					<li>
						<span className={styles.label}>Company</span> <span>{thread.requesterCompany}</span>
					</li>
				)}
			</ul>
		</header>
	);
}
