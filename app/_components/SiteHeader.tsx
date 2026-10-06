import Link from "next/link";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import AccountMenu from "@/app/_components/AccountMenu";
import type { CurrentUser } from "@/app/_lib/types";
import styles from "./SiteHeader.module.scss";

// Stays a synchronous server component. The layout reads the user and passes it in.
export default function SiteHeader({ user }: { user: CurrentUser | null }) {
	return (
		<header className={styles.header}>
			<Link href="/" className={styles.link}>
				<Typography component="span" variant="displaySm">
					Iskawt
				</Typography>
			</Link>
			<div className={styles.account}>
				{user ? (
					<>
						<Link href="/inbox" className={styles.link}>
							Inbox
						</Link>
						{user.host &&<Chip label="Host" size="small" color="primary" variant="outlined" />}
						<AccountMenu user={user} />
					</>
				) : (
					<Link href="/sign-in" className={styles.link}>
						Sign in
					</Link>
				)}
			</div>
		</header>
	);
}
