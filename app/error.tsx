"use client"; // error boundaries must be client components

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import styles from "@/app/_styles/message.module.scss";

// Reports the error to Sentry (scrubbed to an allowlist; see app/_lib/sentryScrub.ts)
// but never renders it: in development its message can carry query details.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
	useEffect(() => {
		Sentry.captureException(error);
	}, [error]);

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
