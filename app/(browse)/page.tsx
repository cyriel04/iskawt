import type { Metadata } from "next";
import { connection } from "next/server";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import BrowseView from "@/app/_components/BrowseView";
import { INDICATIVE_RATES_NOTE } from "@/app/_components/labels";
import { searchPublishedSpaces } from "@/app/_lib/server/spaces";
import { parseSpaceFilters } from "@/app/_lib/spaceFilters";
import type { RawSearchParams } from "@/app/_lib/types";
import styles from "./page.module.scss";

export const metadata: Metadata = {
	title: "Iskawt — shoot spaces in Metro Manila",
	description: "Private spaces across Metro Manila for film and photo shoots.",
};

export default async function BrowsePage({
	searchParams,
}: {
	searchParams: Promise<RawSearchParams>;
}) {
	// Listings change without a deploy, so never prerender this page at build time.
	await connection();
	const filters = parseSpaceFilters(await searchParams);
	const result = await searchPublishedSpaces(filters);

	return (
		<Container component="main" disableGutters maxWidth={false} className={styles.page}>
			<header className={styles.header}>
				<Typography variant="displayLg">Shoot spaces in Metro Manila</Typography>
				<Typography color="text.secondary">{INDICATIVE_RATES_NOTE}</Typography>
			</header>
			<BrowseView filters={filters} result={result} />
		</Container>
	);
}
