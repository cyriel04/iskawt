import { screen } from "@testing-library/react";
import SpaceCard from "@/app/_components/SpaceCard";
import { demoCard, demoPhoto, renderWithTheme } from "@/app/_components/testing";

describe("SpaceCard", () => {
	it("links the whole card to the listing page", () => {
		renderWithTheme(<SpaceCard space={demoCard} />);

		expect(screen.getByRole("link", { name: /Corner loft with afternoon light/ })).toHaveAttribute(
			"href",
			"/spaces/demo-poblacion-loft",
		);
	});

	it("titles the card with a heading", () => {
		renderWithTheme(<SpaceCard space={demoCard} />);

		expect(
			screen.getByRole("heading", { level: 2, name: "[DEMO] Corner loft with afternoon light" }),
		).toBeInTheDocument();
	});

	it("shows area, city and space type", () => {
		renderWithTheme(<SpaceCard space={demoCard} />);

		expect(screen.getByText("Poblacion, Makati · Apartment")).toBeInTheDocument();
	});

	it("marks the host as verified", () => {
		renderWithTheme(<SpaceCard space={demoCard} />);

		expect(screen.getByText("Verified host")).toBeInTheDocument();
	});

	it("leads with the hourly rate and its minimum", () => {
		renderWithTheme(<SpaceCard space={demoCard} />);

		expect(screen.getByText("₱1,800")).toBeInTheDocument();
		expect(screen.getByText(/\/hour · 3hr min/)).toBeInTheDocument();
	});

	it("falls back to the half-day rate when there is no hourly rate", () => {
		const space = { ...demoCard, rates: { ...demoCard.rates, hourly: null, minimumHours: null } };
		renderWithTheme(<SpaceCard space={space} />);

		expect(screen.getByText("₱7,000")).toBeInTheDocument();
		expect(screen.getByText(/\/half day/)).toBeInTheDocument();
	});

	it("says the rate is on inquiry when the host gave none", () => {
		const space = {
			...demoCard,
			rates: { hourly: null, halfDay: null, fullDay: null, minimumHours: null },
		};
		renderWithTheme(<SpaceCard space={space} />);

		expect(screen.getByText("Rate on inquiry")).toBeInTheDocument();
	});

	it("shows size, crew and light", () => {
		renderWithTheme(<SpaceCard space={demoCard} />);

		expect(screen.getByText("68 sqm · 12 crew · Abundant light")).toBeInTheDocument();
	});

	it("leaves out facts the host did not give", () => {
		const space = { ...demoCard, floorAreaSqm: null, naturalLight: "UNKNOWN" as const };
		renderWithTheme(<SpaceCard space={space} />);

		expect(screen.getByText("12 crew")).toBeInTheDocument();
	});

	it("shows a placeholder, not an invented photo, when there are no photos", () => {
		renderWithTheme(<SpaceCard space={demoCard} />);

		expect(screen.getByText("No photos yet")).toBeInTheDocument();
		expect(screen.queryByRole("img")).not.toBeInTheDocument();
	});

	it("shows the cover photo with its alt text", () => {
		renderWithTheme(<SpaceCard space={{ ...demoCard, coverPhoto: demoPhoto }} />);

		expect(screen.getByRole("img", { name: "Demo photo placeholder" })).toBeInTheDocument();
	});
});
