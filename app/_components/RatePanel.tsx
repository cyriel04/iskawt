import { Fragment } from "react";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { INDICATIVE_RATES_NOTE, formatPeso } from "@/app/_components/labels";
import type { IndicativeRates, PublicHost } from "@/app/_lib/types";
import styles from "./RatePanel.module.scss";

type Props = { rates: IndicativeRates; rateNotes: string | null; host: PublicHost };

export default function RatePanel({ rates, rateNotes, host }: Props) {
	const rows = [
		{ term: "Per hour", amount: rates.hourly },
		{ term: "Half day", amount: rates.halfDay },
		{ term: "Full day", amount: rates.fullDay },
	].filter((row): row is { term: string; amount: number } => row.amount !== null);

	return (
		<Paper component="aside" aria-label="Rates and host" className={styles.panel}>
			<div className={styles.group}>
				<Typography variant="label" component="h2">
					Indicative rates
				</Typography>
				{rows.length > 0 ? (
					<dl className={styles.rates}>
						{rows.map((row) => (
							<Fragment key={row.term}>
								<Typography component="dt" color="text.secondary">
									{row.term}
								</Typography>
								<Typography component="dd" variant="dataLg" className={styles.amount}>
									{formatPeso(row.amount)}
								</Typography>
							</Fragment>
						))}
					</dl>
				) : (
					<Typography>Rate on inquiry</Typography>
				)}
				{rates.minimumHours !== null && (
					<Typography variant="caption">
						Minimum {rates.minimumHours} {rates.minimumHours === 1 ? "hour" : "hours"}
					</Typography>
				)}
				{rateNotes && <Typography variant="caption">{rateNotes}</Typography>}
				<Typography variant="caption" color="text.secondary">
					{INDICATIVE_RATES_NOTE}
				</Typography>
			</div>
			<Divider />
			<div className={styles.host}>
				<Typography variant="bodyStrong">Hosted by {host.displayName}</Typography>
				<Typography variant="label" className={styles.verified}>
					Verified host
				</Typography>
				{host.respondsInHours !== null && (
					<Typography variant="caption" color="text.secondary">
						Usually replies within {host.respondsInHours} {host.respondsInHours === 1 ? "hour" : "hours"}.
					</Typography>
				)}
				{host.about && <Typography variant="caption">{host.about}</Typography>}
			</div>
		</Paper>
	);
}
