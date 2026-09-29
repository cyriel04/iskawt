import Container from "@mui/material/Container";
import Skeleton from "@mui/material/Skeleton";
import styles from "./page.module.scss";

export default function Loading() {
	return (
		<Container component="main" disableGutters maxWidth={false} aria-busy="true" aria-label="Loading" className={styles.page}>
			<header className={styles.header}>
				<Skeleton variant="text" className={styles.skeletonTitle} />
				<Skeleton variant="text" className={styles.skeletonNote} />
			</header>
			<Skeleton variant="text" className={styles.skeletonCount} />
			<div className={styles.skeletonGrid}>
				{[0, 1, 2].map((key) => (
					<Skeleton key={key} variant="rounded" className={styles.skeletonCard} />
				))}
			</div>
		</Container>
	);
}
