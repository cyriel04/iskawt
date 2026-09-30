import Typography from "@mui/material/Typography";
import SpaceCard from "@/app/_components/SpaceCard";
import type { SpaceCard as SpaceCardData } from "@/app/_lib/types";
import styles from "./BrowseResults.module.scss";

// showCount={false} when a parent (BrowseView) shows the total across pages.
export default function BrowseResults({
	spaces,
	showCount = true,
}: {
	spaces: SpaceCardData[];
	showCount?: boolean;
}) {
	if (spaces.length === 0) {
		return (
			<section className={styles.empty}>
				<Typography variant="displaySm">No spaces listed yet</Typography>
				<Typography color="text.secondary">
					Every host is verified by a person before their space appears here. Check back soon.
				</Typography>
			</section>
		);
	}

	return (
		<section aria-label="Spaces" className={styles.results}>
			{showCount && (
				<Typography variant="caption" color="text.secondary">
					{spaces.length === 1 ? "1 space" : `${spaces.length} spaces`}
				</Typography>
			)}
			<ul className={styles.grid}>
				{spaces.map((space) => (
					<li key={space.slug}>
						<SpaceCard space={space} />
					</li>
				))}
			</ul>
		</section>
	);
}
