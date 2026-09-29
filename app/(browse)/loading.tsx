import Container from "@mui/material/Container";
import Skeleton from "@mui/material/Skeleton";
import styles from "./page.module.scss";

export default function Loading() {
	return (
		<Container component="main" maxWidth="lg" aria-busy="true" aria-label="Loading" className={styles.page}>
			<Skeleton variant="text" className={styles.skeletonTitle} />
			<div className={styles.skeletonGrid}>
				{[0, 1, 2].map((key) => (
					<Skeleton key={key} variant="rounded" className={styles.skeletonCard} />
				))}
			</div>
		</Container>
	);
}
