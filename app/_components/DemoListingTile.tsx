import Typography from "@mui/material/Typography";
import styles from "./DemoListingTile.module.scss";

// Full-width strip directly under a demo listing's gallery.
export default function DemoListingTile() {
	return (
		<div className={styles.tile}>
			<Typography variant="bodyStrong">
				Demo listing, for internal use only. Photos, rates and host are not real.
			</Typography>
		</div>
	);
}
