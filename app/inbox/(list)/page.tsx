import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import InboxList from "@/app/_components/InboxList";
import { SITE_NAME } from "@/app/_lib/constants/site";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { listInquiriesForUser } from "@/app/_lib/server/inquiries";
import styles from "./page.module.scss";

export const metadata: Metadata = { title: `Inbox — ${SITE_NAME}` };

export default async function InboxPage() {
	const user = await getCurrentUser();
	if (!user) redirect(`/sign-in?next=${encodeURIComponent("/inbox")}`);
	const items = await listInquiriesForUser(user.id);
	return (
		<Container component="main" disableGutters maxWidth={false} className={styles.page}>
			<Typography variant="displayLg" component="h1">
				Inbox
			</Typography>
			<InboxList items={items} />
		</Container>
	);
}
