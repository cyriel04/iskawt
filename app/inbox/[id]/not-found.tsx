import Link from "next/link";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import styles from "@/app/_styles/message.module.scss";

// Shown for a thread that doesn't exist or isn't the viewer's: the same
// screen either way, so the page never confirms a stranger's inquiry exists.
export default function ThreadNotFound() {
	return (
		<Container component="main" disableGutters maxWidth={false} className={styles.screen}>
			<Typography variant="displayLg" component="h1">
				This conversation isn&apos;t available.
			</Typography>
			<Typography className={styles.link}>
				<Link href="/inbox">Go to your inbox</Link>
			</Typography>
		</Container>
	);
}
