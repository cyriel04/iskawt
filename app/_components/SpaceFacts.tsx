import { Fragment, type ReactNode } from "react";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { levelLabels, naturalLightLabels, powerAccessLabels, productionTypeLabels } from "@/app/_lib/constants/labels";
import type { SpaceDetail } from "@/app/_lib/types";
import styles from "./SpaceFacts.module.scss";

type Row = { term: string; detail: string };

const yesNo = (value: boolean) => (value ? "Yes" : "No");

// Builds rows from what the host gave; anything unknown is left out, not shown as blank.
function specRows(space: SpaceDetail): Row[] {
	const rows: (Row | null)[] = [
		space.floorAreaSqm !== null ? { term: "Floor area", detail: `${space.floorAreaSqm} sqm` } : null,
		space.ceilingHeightM !== null ? { term: "Ceiling height", detail: `${space.ceilingHeightM.toFixed(2)} m` } : null,
		space.maxCrew !== null ? { term: "Max crew", detail: String(space.maxCrew) } : null,
		space.naturalLight !== "UNKNOWN" ? { term: "Natural light", detail: naturalLightLabels[space.naturalLight] } : null,
		space.windowDirection !== null ? { term: "Window direction", detail: space.windowDirection } : null,
		{ term: "Blackout", detail: yesNo(space.blackoutCapable) },
		space.powerOutlets !== null ? { term: "Outlets", detail: String(space.powerOutlets) } : null,
		space.powerAccess !== "UNKNOWN" ? { term: "Power access", detail: powerAccessLabels[space.powerAccess] } : null,
		space.noiseLevel !== null ? { term: "Noise level", detail: levelLabels[space.noiseLevel] } : null,
		{ term: "Soundproofed", detail: yesNo(space.soundproofed) },
		space.parkingSpaces !== null
			? { term: "Parking", detail: space.parkingSpaces === 1 ? "1 slot" : `${space.parkingSpaces} slots` }
			: null,
		space.restrooms !== null ? { term: "Restrooms", detail: String(space.restrooms) } : null,
		{ term: "Wi-Fi", detail: yesNo(space.hasWifi) },
		{ term: "Elevator", detail: yesNo(space.hasElevator) },
	];
	return rows.filter((row): row is Row => row !== null);
}

function accessRows(space: SpaceDetail): Row[] {
	const rows: (Row | null)[] = [
		space.loadInNotes !== null ? { term: "Load-in", detail: space.loadInNotes } : null,
		space.accessNotes !== null ? { term: "Access", detail: space.accessNotes } : null,
		space.houseRules !== null ? { term: "House rules", detail: space.houseRules } : null,
		space.availabilityNotes !== null ? { term: "Availability", detail: space.availabilityNotes } : null,
	];
	return rows.filter((row): row is Row => row !== null);
}

function FactList({ rows }: { rows: Row[] }) {
	return (
		<dl className={styles.facts}>
			{rows.map((row) => (
				<Fragment key={row.term}>
					<Typography component="dt" variant="label" color="text.secondary">
						{row.term}
					</Typography>
					<Typography component="dd" className={styles.detail}>
						{row.detail}
					</Typography>
				</Fragment>
			))}
		</dl>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className={styles.section}>
			<Typography variant="displaySm">{title}</Typography>
			{children}
		</section>
	);
}

export default function SpaceFacts({ space }: { space: SpaceDetail }) {
	const access = accessRows(space);

	return (
		<>
			<Section title="Specs">
				<FactList rows={specRows(space)} />
			</Section>
			{access.length > 0 && (
				<Section title="Getting in">
					<FactList rows={access} />
				</Section>
			)}
			{space.filmCredits.length > 0 && (
				<Section title="Shot here">
					<ul className={styles.credits}>
						{space.filmCredits.map((credit) => {
							const label = `${credit.title}${credit.year !== null ? ` (${credit.year})` : ""}`;
							return (
								<Typography component="li" key={`${credit.title}-${credit.year}`}>
									{credit.sourceUrl ? (
										<Link href={credit.sourceUrl} rel="noopener noreferrer" target="_blank">
											{label}
										</Link>
									) : (
										label
									)}{" "}
									· {productionTypeLabels[credit.productionType]}
								</Typography>
							);
						})}
					</ul>
				</Section>
			)}
		</>
	);
}
