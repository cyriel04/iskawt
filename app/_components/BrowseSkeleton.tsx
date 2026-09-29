import Skeleton from "@mui/material/Skeleton";
import styles from "./BrowseSkeleton.module.scss";

export default function BrowseSkeleton() {
	return (
		<div aria-busy="true" aria-label="Loading spaces" className={styles.skeletonGrid}>
			{[0, 1, 2].map((key) => (
				<Skeleton key={key} variant="rounded" className={styles.skeletonCard} />
			))}
		</div>
	);
}
