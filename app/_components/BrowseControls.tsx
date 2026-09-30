"use client"; // Form submit handlers navigate with the router; the panel opens and closes.

// The only client code on the browse page: the search box and the filter
// panel, together so they share one search draft. Neither holds filter state:
// inputs are uncontrolled drafts seeded from the URL, and submitting navigates
// to the canonical URL for the new filters, always on page 1. Applying the
// panel reads whatever is in the search box now, submitted or not.

import { useId, useRef, useState, useSyncExternalStore, type FormEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { cityLabels, naturalLightLabels, settingLabels, spaceTypeLabels } from "@/app/_lib/constants/labels";
import { CREW_MAX, RATE_MAX, SEARCH_TEXT_MAX } from "@/app/_lib/constants/limits";
import {
	CITY_VALUES,
	LIGHT_VALUES,
	SETTING_VALUES,
	SPACE_TYPE_VALUES,
	paramValue,
	parseSpaceFilters,
	serializeSpaceFilters,
	spacesHref,
} from "@/app/_lib/spaceFilters";
import type { RawSearchParams, SpaceFilters } from "@/app/_lib/types";
import styles from "./BrowseControls.module.scss";

function formParams(form: HTMLFormElement): RawSearchParams {
	const data = new FormData(form);
	const raw: RawSearchParams = {};
	for (const key of new Set(data.keys())) {
		raw[key] = data.getAll(key).filter((v): v is string => typeof v === "string");
	}
	return raw;
}

// False in server HTML and during hydration, true once React runs in the
// browser. No subscription: it only ever changes once.
const noSubscription = () => () => {};
function useHydrated(): boolean {
	return useSyncExternalStore(
		noSubscription,
		() => true,
		() => false,
	);
}

// ---------------------------------------------------------------- search

function SearchBox({ filters, inputRef }: { filters: SpaceFilters; inputRef: RefObject<HTMLInputElement | null> }) {
	const router = useRouter();
	// Everything but the search text and the page, carried as hidden fields so
	// the form also works as a plain GET before hydration.
	const carried = [...serializeSpaceFilters({ ...filters, q: null, page: 1 }).entries()];

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const { q } = parseSpaceFilters(formParams(event.currentTarget));
		router.push(spacesHref({ ...filters, q, page: 1 }));
	}

	return (
		<form role="search" action="/" method="get" onSubmit={submit} className={styles.search}>
			<TextField
				// Re-seed the draft when the URL's search changes, e.g. a chip clears it.
				key={filters.q ?? ""}
				type="search"
				name="q"
				label="Search spaces"
				placeholder="Rooftop, white walls, high ceilings, Poblacion…"
				defaultValue={filters.q ?? ""}
				inputRef={inputRef}
				size="small"
				fullWidth
				slotProps={{ htmlInput: { maxLength: SEARCH_TEXT_MAX } }}
				className={styles.searchField}
			/>
			{carried.map(([name, value]) => (
				<input key={`${name}=${value}`} type="hidden" name={name} value={value} />
			))}
			<Button type="submit" variant="contained">
				Search
			</Button>
		</form>
	);
}

// ---------------------------------------------------------------- filter panel

function CheckboxGroup<T extends string>({
	legend,
	name,
	values,
	labels,
	selected,
}: {
	legend: string;
	name: string;
	values: readonly T[];
	labels: Record<T, string>;
	selected: readonly T[];
}) {
	return (
		<FormControl component="fieldset" className={styles.group}>
			<FormLabel component="legend" className={styles.legend}>
				<Typography variant="label">{legend}</Typography>
			</FormLabel>
			<FormGroup className={styles.options}>
				{values.map((value) => (
					<FormControlLabel
						key={value}
						label={labels[value]}
						className={styles.option}
						control={<Checkbox name={name} value={paramValue(value)} defaultChecked={selected.includes(value)} />}
					/>
				))}
			</FormGroup>
		</FormControl>
	);
}

function FilterPanel({ filters, searchRef }: { filters: SpaceFilters; searchRef: RefObject<HTMLInputElement | null> }) {
	const router = useRouter();
	const hydrated = useHydrated();
	const [open, setOpen] = useState(false);
	const titleId = useId();
	const rateNoteId = useId();

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		// The search draft as it stands in the box, parsed like any other q.
		const q = searchRef.current === null ? (filters.q ?? undefined) : searchRef.current.value;
		const next = parseSpaceFilters({ ...formParams(event.currentTarget), q });
		setOpen(false);
		router.push(spacesHref({ ...next, page: 1 }));
	}

	return (
		<>
			{/* Disabled until hydrated: before then a click would do nothing. */}
			<Button variant="outlined" aria-haspopup="dialog" disabled={!hydrated} onClick={() => setOpen(true)}>
				All filters
			</Button>
			<Dialog open={open} onClose={() => setOpen(false)} aria-labelledby={titleId} scroll="paper" fullWidth>
				{/* Keyed on the URL: the fields are uncontrolled, so when the filters
				    change (e.g. during the close fade after "Show spaces") the form
				    remounts with fresh defaults instead of MUI warning about them. */}
				<form key={spacesHref(filters)} onSubmit={submit} className={styles.form}>
					<div className={styles.titleBar}>
						<DialogTitle id={titleId} variant="displaySm">
							Filters
						</DialogTitle>
						<IconButton aria-label="Close filters" onClick={() => setOpen(false)}>
							<span aria-hidden="true">×</span>
						</IconButton>
					</div>
					<DialogContent dividers className={styles.content}>
						<CheckboxGroup
							legend="City"
							name="city"
							values={CITY_VALUES}
							labels={cityLabels}
							selected={filters.cities}
						/>
						<CheckboxGroup
							legend="Space type"
							name="type"
							values={SPACE_TYPE_VALUES}
							labels={spaceTypeLabels}
							selected={filters.types}
						/>

						<FormControl component="fieldset" className={styles.group}>
							<FormLabel component="legend" className={styles.legend}>
								<Typography variant="label">Setting</Typography>
							</FormLabel>
							<RadioGroup
								name="setting"
								defaultValue={filters.setting === null ? "" : paramValue(filters.setting)}
								className={styles.options}
							>
								<FormControlLabel value="" label="Any" control={<Radio />} className={styles.option} />
								{SETTING_VALUES.map((value) => (
									<FormControlLabel
										key={value}
										value={paramValue(value)}
										label={settingLabels[value]}
										control={<Radio />}
										className={styles.option}
									/>
								))}
							</RadioGroup>
							<FormHelperText>Spaces that are both indoor and outdoor match either.</FormHelperText>
						</FormControl>

						<CheckboxGroup
							legend="Natural light"
							name="light"
							values={LIGHT_VALUES}
							labels={naturalLightLabels}
							selected={filters.naturalLight}
						/>

						<TextField
							type="number"
							name="crew"
							label="Minimum crew"
							defaultValue={filters.minCrew ?? ""}
							slotProps={{ htmlInput: { min: 1, max: CREW_MAX, step: 1, inputMode: "numeric" } }}
							className={styles.number}
						/>

						<FormControl component="fieldset" className={styles.group} aria-describedby={rateNoteId}>
							<FormLabel component="legend" className={styles.legend}>
								<Typography variant="label">Hourly rate</Typography>
							</FormLabel>
							<div className={styles.range}>
								{(["rateMin", "rateMax"] as const).map((name) => (
									<TextField
										key={name}
										type="number"
										name={name}
										label={name === "rateMin" ? "Minimum hourly rate" : "Maximum hourly rate"}
										defaultValue={(name === "rateMin" ? filters.hourlyRate.min : filters.hourlyRate.max) ?? ""}
										slotProps={{
											htmlInput: { min: 1, max: RATE_MAX, step: 1, inputMode: "numeric" },
											input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> },
										}}
										className={styles.number}
									/>
								))}
							</div>
							<FormHelperText id={rateNoteId}>
								Rates are indicative, set by hosts. Iskawt takes no payment.
							</FormHelperText>
						</FormControl>
					</DialogContent>
					<DialogActions className={styles.actions}>
						<Button type="submit" variant="contained">
							Show spaces
						</Button>
					</DialogActions>
				</form>
			</Dialog>
		</>
	);
}

// ---------------------------------------------------------------- together

export function BrowseControls({ filters }: { filters: SpaceFilters }) {
	const searchRef = useRef<HTMLInputElement>(null);
	return (
		<>
			<SearchBox filters={filters} inputRef={searchRef} />
			<FilterPanel filters={filters} searchRef={searchRef} />
		</>
	);
}
