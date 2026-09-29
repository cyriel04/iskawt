import Link from "next/link";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import PhotoFrame from "@/app/_components/PhotoFrame";
import {
	formatPeso,
	headlineRate,
	lightSummary,
	locationLine,
	spaceTypeLabels,
} from "@/app/_components/labels";
import type { SpaceCard as SpaceCardData } from "@/app/_lib/types";
import styles from "./SpaceCard.module.scss";

export default function SpaceCard({ space }: { space: SpaceCardData }) {
	const rate = headlineRate(space.rates);
	const facts = [
		space.floorAreaSqm !== null ? `${space.floorAreaSqm} sqm` : null,
		space.maxCrew !== null ? `${space.maxCrew} crew` : null,
		lightSummary(space.naturalLight),
	].filter((fact): fact is string => fact !== null);

	return (
		<Card component="article" className={styles.card}>
			<Link href={`/spaces/${space.slug}`} className={styles.link}>
				<PhotoFrame photo={space.coverPhoto} sizes="(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw" />
				<div className={styles.body}>
					<Typography variant="label" className={styles.verified}>
						Verified host
					</Typography>
					<Typography variant="bodyStrong" component="h2" className={styles.title}>
						{space.title}
					</Typography>
					<Typography variant="caption" color="text.secondary">
						{locationLine(space.areaName, space.city)} · {spaceTypeLabels[space.type]}
					</Typography>
					{rate ? (
						<Typography variant="caption">
							<Typography component="span" variant="dataLg">
								{formatPeso(rate.amount)}
							</Typography>{" "}
							/{rate.unit}
							{space.rates.minimumHours !== null ? ` · ${space.rates.minimumHours}hr min` : ""}
						</Typography>
					) : (
						<Typography variant="caption" color="text.secondary">
							Rate on inquiry
						</Typography>
					)}
					{facts.length > 0 && (
						<Typography variant="data" component="p" color="text.secondary">
							{facts.join(" · ")}
						</Typography>
					)}
				</div>
			</Link>
		</Card>
	);
}
