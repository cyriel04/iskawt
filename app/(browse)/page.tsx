import type { Metadata } from "next";
import { connection } from "next/server";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import BrowseView from "@/app/_components/BrowseView";
import { cityLabels, spaceTypePluralLabels } from "@/app/_lib/constants/labels";
import { INDICATIVE_RATES_NOTE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/app/_lib/constants/site";
import { searchPublishedSpaces } from "@/app/_lib/server/spaces";
import { parseSpaceFilters } from "@/app/_lib/spaceFilters";
import type { RawSearchParams, SpaceFilters } from "@/app/_lib/types";
import styles from "./page.module.scss";


// "Studios in Makati", "Spaces in Makati", "Studios", or null when the filters
// are not exactly one city and/or one type. Other filters do not change it.
function filteredTitle({ cities, types }: SpaceFilters): string | null {
	if (cities.length > 1 || types.length > 1) return null;
	const [city] = cities;
	const [type] = types;
	const what = type === undefined ? "Spaces" : spaceTypePluralLabels[type];
	if (city !== undefined) return `${what} in ${cityLabels[city]}`;
	return type === undefined ? null : what;
}

export async function generateMetadata({
	searchParams,
}: {
	searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
	const title = filteredTitle(parseSpaceFilters(await searchParams));
	return { title: title === null ? SITE_TITLE : `${title} — ${SITE_NAME}`, description: SITE_DESCRIPTION };
}

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
