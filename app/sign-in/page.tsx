import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import SignInForm from "@/app/_components/SignInForm";
import { SITE_NAME } from "@/app/_lib/constants/site";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { linkErrorFrom } from "./linkError";
import styles from "./page.module.scss";

export const metadata: Metadata = { title: `Sign in — ${SITE_NAME}` };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SignInPage({ searchParams }: Props) {
	if (await getCurrentUser()) redirect("/");
	const { error } = await searchParams;
	return (
		<Container component="main" maxWidth="xs" className={styles.page}>
			<Typography variant="displayLg" component="h1">
				Sign in
			</Typography>
			<Typography color="text.secondary">We&apos;ll email you a link. No password needed.</Typography>
			<SignInForm linkError={linkErrorFrom(error)} />
		</Container>
	);
}
