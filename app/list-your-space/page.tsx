import type { Metadata } from "next";
import Link from "next/link";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import HostApplicationForm from "@/app/_components/HostApplicationForm";
import { SITE_NAME } from "@/app/_lib/constants/site";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import styles from "./page.module.scss";

export const metadata: Metadata = { title: `List your space — ${SITE_NAME}` };

// Signed-out visitors see the page and a sign-in link, not a redirect: there
// is no loading.tsx here, and a redirect under one would turn into a 200.
export default async function ListYourSpacePage() {
	const user = await getCurrentUser();
	return (
		<Container component="main" disableGutters maxWidth={false} className={styles.page}>
			<div className={styles.column}>
				<Typography variant="displayLg" component="h1">
					List your space
				</Typography>
				<Typography component="p">
					Iskawt lists private spaces in Metro Manila for film and photo shoots: homes, studios, rooftops, cafés and warehouses.
				</Typography>
				<Typography component="p">A person checks every space before it goes up. Rates are indicative, and Iskawt takes no payment.</Typography>
				<Typography component="p">After you apply, we&apos;ll email you to talk it through.</Typography>
				{user ? (
					<HostApplicationForm email={user.email} />
				) : (
					// A plain Link, not <Button component={Link}>: a server component can't
					// pass a component into MUI's client Button.
					<Link href={`/sign-in?next=${encodeURIComponent("/list-your-space")}`} className={styles.action}>
						Sign in to apply
					</Link>
				)}
			</div>
		</Container>
	);
}
