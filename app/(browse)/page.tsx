import type { Metadata } from "next";
import { connection } from "next/server";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import BrowseResults from "@/app/_components/BrowseResults";
import { INDICATIVE_RATES_NOTE } from "@/app/_components/labels";
import { listPublishedSpaces } from "@/app/_lib/server/spaces";
import styles from "./page.module.scss";

export const metadata: Metadata = {
	title: "Iskawt — shoot spaces in Metro Manila",
	description: "Private spaces across Metro Manila for film and photo shoots.",
};

export default async function BrowsePage() {
	// Listings change without a deploy, so never prerender this page at build time.
	await connection();
	const spaces = await listPublishedSpaces();

	return (
		<Container component="main" maxWidth="lg" className={styles.page}>
			<header className={styles.header}>
				<Typography variant="displayLg">Shoot spaces in Metro Manila</Typography>
				<Typography color="text.secondary">{INDICATIVE_RATES_NOTE}</Typography>
			</header>
			<BrowseResults spaces={spaces} />
		</Container>
	);
}
