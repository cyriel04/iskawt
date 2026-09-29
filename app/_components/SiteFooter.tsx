import Typography from "@mui/material/Typography";
import styles from "./SiteFooter.module.scss";

export default function SiteFooter() {
	return (
		<footer className={styles.footer}>
			<Typography variant="caption" color="text.secondary">
				© {new Date().getFullYear()} Iskawt
			</Typography>
		</footer>
	);
}
