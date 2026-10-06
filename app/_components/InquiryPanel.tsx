import { useId } from "react";
import Link from "next/link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import InquiryForm from "@/app/_components/InquiryForm";
import styles from "./InquiryPanel.module.scss";

type Props = {
	viewer: "signed-out" | "host" | "renter";
	slug: string;
	hostName: string;
	respondsInHours: number | null;
	today: string; // Manila "YYYY-MM-DD", computed on the server
};

export default function InquiryPanel({ viewer, slug, hostName, respondsInHours, today }: Props) {
	const headingId = useId();
	return (
		<Paper component="section" aria-labelledby={headingId} className={styles.panel}>
			<Typography variant="label" component="h2" id={headingId}>
				Send an inquiry
			</Typography>
			{viewer === "signed-out" && (
				// A plain Link, not <Button component={Link}>: a server component can't
				// pass a component into MUI's client Button.
				<Link href={`/sign-in?next=${encodeURIComponent(`/spaces/${slug}`)}`} className={styles.action}>
					Sign in to send an inquiry
				</Link>
			)}
			{viewer === "host" && (
				<>
					<Typography>This is your listing.</Typography>
					<Link href="/inbox" className={styles.link}>
						Go to your inbox
					</Link>
				</>
			)}
			{viewer === "renter" && (
				<InquiryForm spaceSlug={slug} hostName={hostName} respondsInHours={respondsInHours} today={today} />
			)}
		</Paper>
	);
}
