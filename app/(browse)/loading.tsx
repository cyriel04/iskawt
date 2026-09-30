import Container from "@mui/material/Container";
import Skeleton from "@mui/material/Skeleton";
import view from "@/app/_components/BrowseView.module.scss";
import styles from "./page.module.scss";

// Mirrors page.tsx + BrowseView: heading, then the toolbar (search, "All
// filters"), the summary row (a chip, the count) and the grid. Shown on a
// fresh navigation into this route group only; a search-param-only navigation
// keeps the current page on screen until the new one is ready.
export default function Loading() {
	return (
		<Container component="main" disableGutters maxWidth={false} aria-busy="true" aria-label="Loading" className={styles.page}>
			<header className={styles.header}>
				<Skeleton variant="text" className={styles.skeletonTitle} />
				<Skeleton variant="text" className={styles.skeletonNote} />
			</header>
			<div className={view.view}>
				<div className={view.toolbar}>
					<Skeleton variant="rounded" className={styles.skeletonSearch} />
					<Skeleton variant="rounded" className={styles.skeletonFilters} />
				</div>
				<div className={view.summary}>
					<Skeleton variant="rounded" className={styles.skeletonChip} />
					<Skeleton variant="text" className={styles.skeletonCount} />
				</div>
				<div className={styles.skeletonGrid}>
					{[0, 1, 2].map((key) => (
						<Skeleton key={key} variant="rounded" className={styles.skeletonCard} />
					))}
				</div>
			</div>
		</Container>
	);
}
