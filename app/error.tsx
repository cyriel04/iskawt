"use client"; // error boundaries must be client components

import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import styles from "@/app/_styles/message.module.scss";

// Deliberately does not render or log `error`: in development its message can
// carry query details, and the server has already logged it.
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
	return (
		<Container component="main" disableGutters maxWidth={false} className={styles.screen}>
			<Typography variant="displayLg">Something went wrong</Typography>
			<Typography color="text.secondary">
				We couldn&apos;t load this page just now. The problem is on our side, not yours.
			</Typography>
			<Button variant="contained" onClick={() => retry()}>
				Try again
			</Button>
		</Container>
	);
}
