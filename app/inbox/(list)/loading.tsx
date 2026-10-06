import Container from "@mui/material/Container";
import Skeleton from "@mui/material/Skeleton";
import styles from "./page.module.scss";

// Mirrors page.tsx + InboxList: the heading, then a few rows. Scoped to the
// (list) route group on purpose: a loading.tsx at app/inbox/ would sit above
// /inbox/[id] and turn its notFound() into a 200.
export default function Loading() {
	return (
		<Container component="main" disableGutters maxWidth={false} aria-busy="true" aria-label="Loading" className={styles.page}>
			<Skeleton variant="text" className={styles.skeletonTitle} />
			<div className={styles.skeletonRows}>
				{[0, 1, 2].map((key) => (
					<Skeleton key={key} variant="rounded" className={styles.skeletonRow} />
				))}
			</div>
		</Container>
	);
}
