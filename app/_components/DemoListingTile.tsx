import Typography from "@mui/material/Typography";
import styles from "./DemoListingTile.module.scss";

// Last tile of a demo listing's gallery, the same shape as a gallery photo.
export default function DemoListingTile() {
	return (
		<div className={styles.tile}>
			<Typography variant="bodyStrong">
				Demo listing, for internal use only. Photos, rates and host are not real.
			</Typography>
		</div>
	);
}
