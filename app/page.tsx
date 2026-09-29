import type { Metadata } from "next";
import { Suspense } from "react";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import BrowseList from "@/app/_components/BrowseList";
import BrowseSkeleton from "@/app/_components/BrowseSkeleton";
import { INDICATIVE_RATES_NOTE } from "@/app/_components/labels";
import styles from "./page.module.scss";

export const metadata: Metadata = {
	title: "Iskawt — shoot spaces in Metro Manila",
	description: "Private spaces across Metro Manila for film and photo shoots.",
};

export default function BrowsePage() {
	return (
		<Container component="main" disableGutters maxWidth={false} className={styles.page}>
			<header className={styles.header}>
				<Typography variant="displayLg">Shoot spaces in Metro Manila</Typography>
				<Typography color="text.secondary">{INDICATIVE_RATES_NOTE}</Typography>
			</header>
			<Suspense fallback={<BrowseSkeleton />}>
				<BrowseList />
			</Suspense>
		</Container>
	);
}
