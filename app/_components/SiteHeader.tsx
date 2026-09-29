import Link from "next/link";
import Typography from "@mui/material/Typography";
import styles from "./SiteHeader.module.scss";

export default function SiteHeader() {
	return (
		<header className={styles.header}>
			<Link href="/" className={styles.link}>
				<Typography component="span" variant="displaySm">
					Iskawt
				</Typography>
			</Link>
		</header>
	);
}
