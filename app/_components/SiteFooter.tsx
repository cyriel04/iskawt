import Link from "next/link";
import Typography from "@mui/material/Typography";
import styles from "./SiteFooter.module.scss";

export default function SiteFooter() {
	return (
		<footer className={styles.footer}>
			<Typography variant="caption" color="text.secondary">
				© {new Date().getFullYear()} Iskawt
			</Typography>
			<Link href="/#faq" className={styles.link}>
				FAQ
			</Link>
		</footer>
	);
}
