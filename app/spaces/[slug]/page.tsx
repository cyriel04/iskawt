import type { Metadata } from "next";
import { SITE_NAME } from "@/app/_lib/constants/site";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import PhotoFrame from "@/app/_components/PhotoFrame";
import RatePanel from "@/app/_components/RatePanel";
import SpaceFacts from "@/app/_components/SpaceFacts";
import { cityLabels, settingLabels, spaceTypeLabels } from "@/app/_lib/constants/labels";
import { locationLine } from "@/app/_components/labels";
import { getPublishedSpaceBySlug } from "@/app/_lib/server/spaces";
import { EMPTY_FILTERS, spacesHref } from "@/app/_lib/spaceFilters";
import styles from "./page.module.scss";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const space = await getPublishedSpaceBySlug(slug);
	return { title: space ? `${space.title} — ${SITE_NAME}` : `Space not found — ${SITE_NAME}` };
}

export default async function SpacePage({ params }: Props) {
	const { slug } = await params;
	const space = await getPublishedSpaceBySlug(slug);
	if (!space) notFound();

	const location = locationLine(space.areaName, space.city);

	return (
		<Container component="main" disableGutters maxWidth={false} className={styles.page}>
			<Breadcrumbs aria-label="Breadcrumb" color="text.secondary" className={styles.breadcrumb}>
				<Link href="/">Spaces</Link>
				<Link href={spacesHref({ ...EMPTY_FILTERS, cities: [space.city] })}>{cityLabels[space.city]}</Link>
				<Typography component="span" aria-current="page">
					{space.title}
				</Typography>
			</Breadcrumbs>

			<header className={styles.header}>
				<Typography variant="displayLg">{space.title}</Typography>
				<Typography color="text.secondary">
					{location} · {spaceTypeLabels[space.type]} · {settingLabels[space.setting]}
				</Typography>
			</header>

			<div className={styles.gallery}>
				{space.photos.length > 0 ? (
					space.photos.map((photo) => (
						<PhotoFrame shape="gallery" key={photo.url} photo={photo} sizes="(min-width: 900px) 50vw, 100vw" />
					))
				) : (
					<PhotoFrame shape="gallery" photo={null} sizes="100vw" />
				)}
			</div>

			<div className={styles.columns}>
				<div className={styles.main}>
					<section className={styles.about}>
						<Typography variant="displaySm">About this space</Typography>
						<Typography>{space.description}</Typography>
						{space.tags.length > 0 && (
							<ul aria-label="Tags" className={styles.tags}>
								{space.tags.map((tag) => (
									<li key={tag.slug}>
										<Chip label={tag.label} variant="outlined" size="small" />
									</li>
								))}
							</ul>
						)}
					</section>

					<SpaceFacts space={space} />

					<section className={styles.where}>
						<Typography variant="displaySm">Where</Typography>
						<Typography>{location}</Typography>
						<Typography variant="caption" color="text.secondary">
							The host shares the full address once they accept your inquiry.
						</Typography>
					</section>
				</div>

				<div className={styles.aside}>
					<RatePanel rates={space.rates} rateNotes={space.rateNotes} host={space.host} />
				</div>
			</div>
		</Container>
	);
}
