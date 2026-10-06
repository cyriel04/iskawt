// Test support only — never imported by app code.
// Fixtures are DEMO data matching prisma/seed.ts. No real host or space.

import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import theme from "@/app/_lib/theme";
import type { CurrentUser, InquirySummary, InquiryThread, PublicPhoto, SpaceCard, SpaceDetail } from "@/app/_lib/types";

export function renderWithTheme(ui: ReactElement) {
	return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

export const demoCard: SpaceCard = {
	slug: "demo-poblacion-loft",
	title: "[DEMO] Corner loft with afternoon light",
	city: "MAKATI",
	areaName: "Poblacion",
	type: "APARTMENT",
	coverPhoto: null,
	rates: { hourly: 1800, halfDay: 7000, fullDay: 12000, minimumHours: 3 },
	floorAreaSqm: 68,
	maxCrew: 12,
	naturalLight: "ABUNDANT",
};

export const demoDetail: SpaceDetail = {
	...demoCard,
	description:
		"Upper-floor loft in a walk-up off the main strip. Open plan, exposed ceiling, one long wall of windows facing west.",
	setting: "INDOOR",
	photos: [],
	tags: [
		{ slug: "large-windows", label: "Large windows" },
		{ slug: "wood-floors", label: "Wood floors" },
	],
	host: {
		displayName: "Demo Host A",
		about: "Placeholder host record.",
		respondsInHours: 12,
	},
	rateNotes: "Illustrative rates. Overtime and cleaning to be agreed with the host.",
	ceilingHeightM: 3.4,
	windowDirection: "West-facing",
	powerOutlets: 14,
	powerAccess: "ON_SITE",
	blackoutCapable: true,
	noiseLevel: "MEDIUM",
	soundproofed: false,
	hasWifi: true,
	hasElevator: false,
	parkingSpaces: 1,
	restrooms: 1,
	loadInNotes: "Third floor, no lift.",
	accessNotes: "Host meets the crew at street level.",
	houseRules: "No smoke machines. No open flame.",
	availabilityNotes: "Weekdays only. Nothing before 9am.",
	filmCredits: [],
};

export const demoPhoto: PublicPhoto = {
	url: "https://example.invalid/demo-cover.jpg",
	alt: "Demo photo placeholder",
};

export const demoUser: CurrentUser = {
	id: "user_demo",
	email: "demo-user@example.invalid",
	name: null,
	host: null,
};

export const demoHostUser: CurrentUser = {
	id: "user_demo_host",
	email: "demo-host-a@example.invalid",
	name: "Demo Host A",
	host: { displayName: "Demo Host A" },
};

export const demoSummary: InquirySummary = {
	id: "inq_demo",
	role: "RENTER",
	status: "RESPONDED",
	space: { slug: "demo-poblacion-loft", title: "[DEMO] Corner loft with afternoon light" },
	counterpartName: "Demo Host A",
	lastMessage: { body: "Yes, the 20th works.", sentAt: "2026-10-07T10:00:00.000Z", fromMe: false },
	unread: true,
};

export const demoThread: InquiryThread = {
	id: "inq_demo",
	role: "RENTER",
	status: "RESPONDED",
	space: { slug: "demo-poblacion-loft", title: "[DEMO] Corner loft with afternoon light", areaName: "Poblacion", city: "MAKATI" },
	counterpartName: "Demo Host A",
	requesterCompany: "Demo Films",
	shootDate: "2026-10-20",
	durationHours: 6,
	crewSize: 12,
	productionType: "COMMERCIAL",
	budgetNote: null,
	messages: [
		{ id: "m1", body: "Free on the 20th?", sentAt: "2026-10-07T09:00:00.000Z", fromMe: true, senderName: "Demo Renter" },
		{ id: "m2", body: "Yes, the 20th works.", sentAt: "2026-10-07T10:00:00.000Z", fromMe: false, senderName: "Demo Host A" },
	],
	canReply: true,
	canDecline: false,
	canClose: true,
};
