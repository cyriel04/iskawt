import Typography from "@mui/material/Typography";
import styles from "./DemoBanner.module.scss";

export default function DemoBanner() {
	return (
		<div role="note" aria-label="Demo site" className={styles.banner}>
			<Typography variant="caption">This is a demo. Every listing is sample data.</Typography>
		</div>
	);
}
