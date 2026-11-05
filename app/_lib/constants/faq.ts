// FAQ copy for the browse page's "Questions" section. Plain data: FaqSection
// renders whatever is here, so editing copy never touches the component.
// Approved copy: docs/superpowers/specs/2026-11-05-faq-design.md.

import { MAGIC_LINK_TTL_MINUTES } from "./limits";

export type FaqItem = { question: string; answer: string };
export type FaqGroup = { heading: string; items: readonly FaqItem[] };

// Shared by both groups. One object each, so the two copies never drift.
const SIGN_IN: FaqItem = {
	question: "How do I sign in?",
	answer: `Enter your email and we send you a sign-in link. It works once and expires in ${MAGIC_LINK_TTL_MINUTES} minutes. There's no password.`,
};

const REPORT_OR_BLOCK: FaqItem = {
	question: "What if someone makes me uncomfortable?",
	answer:
		"Use the menu in the conversation to report it, which a person reviews, or to block them. A blocked person can't message you or send you new inquiries, and isn't told they were blocked.",
};

export const FAQ_GROUPS: readonly FaqGroup[] = [
	{
		heading: "For renters",
		items: [
			{
				question: "How do I book a space?",
				answer:
					"You don't book on Iskawt. Sign in, open a listing and send an inquiry with your dates, hours, crew size and what you're shooting. The host replies in your Iskawt inbox, and we email you when they do. You agree on everything else directly with the host.",
			},
			{
				question: "Why can't I see the exact address?",
				answer:
					"Listings show only the area and city, because these are people's homes and businesses. The host shares the address with you in the conversation if they decide to go ahead.",
			},
			{
				question: "Are the rates final?",
				answer:
					"No. Rates are indicative and set by each host, and you agree the actual price with them. Iskawt takes no payment.",
			},
			{
				question: "What does \"Demo\" on a listing mean?",
				answer: "It's sample data used while Iskawt is new. It isn't a real space you can rent.",
			},
			{
				question: "Which areas do you cover?",
				answer: "Metro Manila only: its 16 cities and Pateros.",
			},
			{
				question: "Do I need a permit?",
				answer: "Iskawt doesn't handle permits. Ask your host what the building or community needs.",
			},
			SIGN_IN,
			REPORT_OR_BLOCK,
		],
	},
	{
		heading: "For hosts",
		items: [
			{
				question: "How do I list my space?",
				answer:
					"Sign in, go to List your space and send an application. A person reviews every space before it goes live, and we email you to talk it through.",
			},
			{
				question: "Who sees my email and phone number?",
				answer: "Only the Iskawt team. Renters talk to you through your Iskawt inbox.",
			},
			{
				question: "Who sees my address?",
				answer:
					"Only the Iskawt team. Your listing shows the area and city, and you decide whether to share the address with a renter.",
			},
			{
				question: "Does it cost anything to list?",
				answer: "Free to list. No payment goes through Iskawt.",
			},
			{
				question: "Do I have to accept every inquiry?",
				answer: "No. You can decline or close any conversation.",
			},
			SIGN_IN,
			REPORT_OR_BLOCK,
		],
	},
];

// Closing line under both groups. The address itself is CONTACT_EMAIL (site.ts).
export const FAQ_CONTACT_PROMPT = "Still have questions?";
export const FAQ_CONTACT_LEAD = "Email us at";
