import Link from "next/link";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import styles from "@/app/_styles/message.module.scss";

export default function SpaceNotFound() {
	return (
		<Container component="main" disableGutters maxWidth={false} className={styles.screen}>
			<Typography variant="displayLg">This space isn&apos;t listed</Typography>
			<Typography color="text.secondary">It may have been paused by its host, or the link is wrong.</Typography>
			<Typography className={styles.link}>
				<Link href="/">Browse all spaces</Link>
			</Typography>
		</Container>
	);
}
