import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Typography from "@mui/material/Typography";
import { FAQ_CONTACT_LEAD, FAQ_CONTACT_PROMPT, FAQ_GROUPS, type FaqGroup } from "@/app/_lib/constants/faq";
import { CONTACT_EMAIL } from "@/app/_lib/constants/site";
import styles from "./FaqSection.module.scss";

const HEADING_ID = "faq-heading";

function ExpandIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.icon}>
			<path d="M5 9l7 7 7-7" />
		</svg>
	);
}

// The "Questions" section at the foot of the browse page; the footer links to
// it as /#faq. A server component: MUI's Accordion is a client component, but
// it only receives strings and plain elements from here.
export default function FaqSection({ groups = FAQ_GROUPS }: { groups?: readonly FaqGroup[] }) {
	return (
		<section id="faq" aria-labelledby={HEADING_ID} className={styles.section}>
			<Typography variant="displaySm" id={HEADING_ID}>
				Questions
			</Typography>
			<div className={styles.groups}>
				{groups.map((group, g) => (
					<div key={group.heading} className={styles.group}>
						<Typography variant="label" component="h3">
							{group.heading}
						</Typography>
						<div className={styles.list}>
							{group.items.map((item, i) => {
								const id = `faq-${g}-${i}`;
								return (
									<Accordion key={item.question} disableGutters slots={{ heading: "h4" }} className={styles.item}>
										<AccordionSummary
											id={`${id}-question`}
											aria-controls={`${id}-answer`}
											expandIcon={<ExpandIcon />}
											className={styles.summary}
										>
											<Typography variant="bodyStrong" component="span">
												{item.question}
											</Typography>
										</AccordionSummary>
										<AccordionDetails className={styles.details}>
											<Typography>{item.answer}</Typography>
										</AccordionDetails>
									</Accordion>
								);
							})}
						</div>
					</div>
				))}
			</div>
			<div className={styles.contact}>
				<Typography variant="bodyStrong">{FAQ_CONTACT_PROMPT}</Typography>
				<Typography component="p" className={styles.contactLine}>
					{FAQ_CONTACT_LEAD}{" "}
					<a href={`mailto:${CONTACT_EMAIL}`} className={styles.link}>
						{CONTACT_EMAIL}
					</a>
				</Typography>
			</div>
		</section>
	);
}
