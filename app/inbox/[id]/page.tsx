import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Container from "@mui/material/Container";
import ThreadSummary from "@/app/_components/ThreadSummary";
import ThreadView from "@/app/_components/ThreadView";
import { SITE_NAME } from "@/app/_lib/constants/site";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { getInquiryThread } from "@/app/_lib/server/inquiries";
import styles from "./page.module.scss";

// Generic title on purpose: generateMetadata would read the thread a second
// time and mark it read again.
export const metadata: Metadata = { title: `Conversation — ${SITE_NAME}` };

// No loading.tsx here or at app/inbox/: it would stream a 200 shell before
// notFound() runs, turning this route's 404 into a 200.
type Props = { params: Promise<{ id: string }> };

export default async function ThreadPage({ params }: Props) {
	const { id } = await params;
	const user = await getCurrentUser();
	if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/inbox/${id}`)}`);
	const thread = await getInquiryThread(id, user.id);
	if (!thread) notFound();
	return (
		<Container component="main" disableGutters maxWidth={false} className={styles.page}>
			<Link href="/inbox" className={styles.back}>
				Back to inbox
			</Link>
			<ThreadSummary thread={thread} />
			<ThreadView thread={thread} />
		</Container>
	);
}
