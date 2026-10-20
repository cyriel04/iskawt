"use client"; // error boundaries must be client components

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import styles from "@/app/_styles/message.module.scss";

// The root layout itself failed, so there is no theme and no layout: this
// renders its own <html> and <body>. Plain elements, styled by the shared
// message module (its tokens fall back gracefully without the theme's CSS
// variables). Reports to Sentry; never renders the error.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
	useEffect(() => {
		// A digest means a server render failed, which onRequestError has already reported.
		if (!error.digest) Sentry.captureException(error);
	}, [error]);

	return (
		<html lang="en">
			<body>
				<main className={styles.screen}>
					<h1>Something went wrong</h1>
					<p>We couldn&apos;t load this page just now. The problem is on our side, not yours.</p>
					<button type="button" className={styles.button} onClick={() => retry()}>
						Try again
					</button>
				</main>
			</body>
		</html>
	);
}
