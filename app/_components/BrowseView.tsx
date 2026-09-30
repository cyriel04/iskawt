// The browse page body: search, filters, active-filter chips, count, results,
// empty states and pagination. A server component. Every chip, clear and page
// control is a plain link to a canonical URL, so the view works before
// hydration and every state can be pasted into another tab. Only the search box
// and the filter panel are client code (BrowseControls).

import Link from "next/link";
import Typography from "@mui/material/Typography";
import { BrowseControls } from "@/app/_components/BrowseControls";
import BrowseResults from "@/app/_components/BrowseResults";
import {
	cityLabels,
	formatPeso,
	lightSummary,
	naturalLightLabels,
	settingLabels,
	spaceTypeLabels,
} from "@/app/_components/labels";
import { EMPTY_FILTERS, hasActiveFilters, spacesHref } from "@/app/_lib/spaceFilters";
import type { SpaceFilters, SpaceSearchResult } from "@/app/_lib/types";
import styles from "./BrowseView.module.scss";

type Chip = {
	key: string;
	label: string; // visible text
	name: string; // what the clear control removes, for its accessible name
	href: string; // the URL without this value, back on page 1
};

function rateLabel({ min, max }: SpaceFilters["hourlyRate"]): string | null {
	if (min !== null && max !== null) return `${formatPeso(min)}–${formatPeso(max)}/hour`;
	if (min !== null) return `From ${formatPeso(min)}/hour`;
	if (max !== null) return `Up to ${formatPeso(max)}/hour`;
	return null;
}

function activeChips(filters: SpaceFilters): Chip[] {
	const without = (change: Partial<SpaceFilters>) => spacesHref({ ...filters, ...change, page: 1 });
	const chips: Chip[] = [];

	if (filters.q !== null) {
		const quoted = `“${filters.q}”`;
		chips.push({ key: "q", label: quoted, name: `search ${quoted}`, href: without({ q: null }) });
	}
	for (const city of filters.cities) {
		const label = cityLabels[city];
		chips.push({ key: `city-${city}`, label, name: label, href: without({ cities: filters.cities.filter((c) => c !== city) }) });
	}
	for (const type of filters.types) {
		const label = spaceTypeLabels[type];
		chips.push({ key: `type-${type}`, label, name: label, href: without({ types: filters.types.filter((t) => t !== type) }) });
	}
	if (filters.setting !== null) {
		const label = settingLabels[filters.setting];
		chips.push({ key: "setting", label, name: label, href: without({ setting: null }) });
	}
	for (const light of filters.naturalLight) {
		const label = lightSummary(light) ?? naturalLightLabels[light];
		chips.push({
			key: `light-${light}`,
			label,
			name: label,
			href: without({ naturalLight: filters.naturalLight.filter((l) => l !== light) }),
		});
	}
	if (filters.minCrew !== null) {
		const label = `Crew of ${filters.minCrew}+`;
		chips.push({ key: "crew", label, name: label, href: without({ minCrew: null }) });
	}
	const rate = rateLabel(filters.hourlyRate);
	if (rate !== null) {
		chips.push({ key: "rate", label: rate, name: rate, href: without({ hourlyRate: { min: null, max: null } }) });
	}
	return chips;
}

function countLabel(total: number): string {
	return total === 1 ? "1 space" : `${total} spaces`;
}

function Pagination({ filters, result }: { filters: SpaceFilters; result: SpaceSearchResult }) {
	const { page, pageCount } = result;
	return (
		<nav aria-label="Pages" className={styles.pager}>
			{page > 1 ? (
				<Link href={spacesHref({ ...filters, page: page - 1 })} rel="prev" className={styles.action}>
					Previous page
				</Link>
			) : (
				<span />
			)}
			<Typography variant="caption" color="text.secondary">
				Page {page} of {pageCount}
			</Typography>
			{page < pageCount ? (
				<Link href={spacesHref({ ...filters, page: page + 1 })} rel="next" className={styles.action}>
					Next page
				</Link>
			) : (
				<span />
			)}
		</nav>
	);
}

export default function BrowseView({ filters, result }: { filters: SpaceFilters; result: SpaceSearchResult }) {
	// Nothing published at all: not a filtering problem, so no filter controls.
	if (result.total === 0 && !hasActiveFilters(filters)) {
		return <BrowseResults spaces={[]} />;
	}

	const chips = activeChips(filters);
	const pastLastPage = result.total > 0 && result.spaces.length === 0;

	return (
		<div className={styles.view}>
			<div className={styles.toolbar}>
				<BrowseControls filters={filters} />
			</div>

			<div className={styles.summary}>
				{chips.length > 0 && (
					<>
						<ul aria-label="Active filters" className={styles.chips}>
							{chips.map((chip) => (
								<li key={chip.key}>
									<Link href={chip.href} aria-label={`Remove ${chip.name}`} className={styles.chip}>
										<span>{chip.label}</span>
										<span aria-hidden="true">×</span>
									</Link>
								</li>
							))}
						</ul>
						<Link href={spacesHref(EMPTY_FILTERS)} className={styles.textLink}>
							Clear all
						</Link>
					</>
				)}
				<Typography variant="caption" color="text.secondary" aria-live="polite" className={styles.count}>
					{countLabel(result.total)}
				</Typography>
			</div>

			{result.total === 0 ? (
				<section className={styles.empty}>
					<Typography variant="displaySm">No spaces match these filters</Typography>
					<Typography color="text.secondary">
						Try removing a filter above, or start again with every space in Metro Manila.
					</Typography>
					<Link href={spacesHref(EMPTY_FILTERS)} className={styles.action}>
						Clear all filters
					</Link>
				</section>
			) : pastLastPage ? (
				<section className={styles.empty}>
					<Typography variant="displaySm">There is no page {result.page}</Typography>
					<Typography color="text.secondary">
						These filters have {result.pageCount === 1 ? "1 page" : `${result.pageCount} pages`} of spaces.
					</Typography>
					<Link href={spacesHref({ ...filters, page: 1 })} className={styles.action}>
						Back to page 1
					</Link>
				</section>
			) : (
				<>
					<BrowseResults spaces={result.spaces} showCount={false} />
					{result.pageCount > 1 && <Pagination filters={filters} result={result} />}
				</>
			)}
		</div>
	);
}
