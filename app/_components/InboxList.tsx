import Link from "next/link";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { formatSentAt } from "@/app/_components/threadMessages";
import { inquiryStatusLabels } from "@/app/_lib/constants/labels";
import type { InquirySummary } from "@/app/_lib/types";
import styles from "./InboxList.module.scss";

// Server component. Every row links with prefetch={false}: opening a thread
// marks it read, so a prefetch must not.
export default function InboxList({ items }: { items: InquirySummary[] }) {
	if (items.length === 0) {
		return (
			<div className={styles.empty}>
				<Typography variant="body1">No conversations yet.</Typography>
				<Link href="/" className={styles.browse}>
					Browse spaces
				</Link>
			</div>
		);
	}

	return (
		<ul aria-label="Conversations" className={styles.list}>
			{items.map((item) => (
				<li key={item.id} className={styles.item}>
					<Link href={`/inbox/${item.id}`} prefetch={false} className={styles.row}>
						<span className={styles.top}>
							{item.unread && (
								<>
									<span className={styles.dot} aria-hidden="true" />
									<span className={styles.srOnly}>Unread</span>
								</>
							)}
							<Typography component="span" variant={item.unread ? "bodyStrong" : "body1"} className={styles.title}>
								{item.space.title}
							</Typography>
							<Chip
								component="span"
								label={inquiryStatusLabels[item.status]}
								size="small"
								variant="outlined"
								className={styles.status}
							/>
						</span>
						<Typography component="span" variant="caption" className={styles.meta}>
							{item.counterpartName} · {item.role === "HOST" ? "Your listing" : "You asked"} ·{" "}
							{formatSentAt(item.lastMessage.sentAt)}
						</Typography>
						<Typography component="span" variant={item.unread ? "bodyStrong" : "body1"} className={styles.preview}>
							{item.lastMessage.fromMe ? `You: ${item.lastMessage.body}` : item.lastMessage.body}
						</Typography>
					</Link>
				</li>
			))}
		</ul>
	);
}
