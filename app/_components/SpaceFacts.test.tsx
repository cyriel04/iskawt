import { screen } from "@testing-library/react";
import SpaceFacts from "@/app/_components/SpaceFacts";
import { demoDetail, renderWithTheme } from "@/app/_components/testing";

function detailFor(term: string) {
	return screen.getByText(term).nextElementSibling?.textContent;
}

describe("SpaceFacts", () => {
	it("lists the practical specs a production needs", () => {
		renderWithTheme(<SpaceFacts space={demoDetail} />);

		expect(screen.getByRole("heading", { name: "Specs" })).toBeInTheDocument();
		expect(detailFor("Floor area")).toBe("68 sqm");
		expect(detailFor("Ceiling height")).toBe("3.40 m");
		expect(detailFor("Max crew")).toBe("12");
		expect(detailFor("Natural light")).toBe("Abundant");
		expect(detailFor("Power access")).toBe("On site");
		expect(detailFor("Noise level")).toBe("Medium");
		expect(detailFor("Parking")).toBe("1 slot");
		expect(detailFor("Blackout")).toBe("Yes");
		expect(detailFor("Elevator")).toBe("No");
	});

	it("leaves out specs the host did not give", () => {
		const space = { ...demoDetail, ceilingHeightM: null, naturalLight: "UNKNOWN" as const, noiseLevel: null };
		renderWithTheme(<SpaceFacts space={space} />);

		expect(screen.queryByText("Ceiling height")).not.toBeInTheDocument();
		expect(screen.queryByText("Natural light")).not.toBeInTheDocument();
		expect(screen.queryByText("Noise level")).not.toBeInTheDocument();
	});

	it("shows load-in, access, house rules and availability", () => {
		renderWithTheme(<SpaceFacts space={demoDetail} />);

		expect(screen.getByRole("heading", { name: "Getting in" })).toBeInTheDocument();
		expect(detailFor("Load-in")).toBe("Third floor, no lift.");
		expect(detailFor("House rules")).toBe("No smoke machines. No open flame.");
		expect(detailFor("Availability")).toBe("Weekdays only. Nothing before 9am.");
	});

	it("drops the Getting in section when the host gave no notes", () => {
		const space = { ...demoDetail, loadInNotes: null, accessNotes: null, houseRules: null, availabilityNotes: null };
		renderWithTheme(<SpaceFacts space={space} />);

		expect(screen.queryByRole("heading", { name: "Getting in" })).not.toBeInTheDocument();
	});

	it("lists film credits, linking the ones with a source", () => {
		const space = {
			...demoDetail,
			filmCredits: [
				{ title: "[DEMO] Short film", year: 2025, productionType: "FILM" as const, sourceUrl: "https://example.invalid/credit" },
				{ title: "[DEMO] Music video", year: null, productionType: "MUSIC_VIDEO" as const, sourceUrl: null },
			],
		};
		renderWithTheme(<SpaceFacts space={space} />);

		expect(screen.getByRole("heading", { name: "Shot here" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "[DEMO] Short film (2025)" })).toHaveAttribute(
			"href",
			"https://example.invalid/credit",
		);
		expect(screen.getByText(/\[DEMO\] Music video/)).toBeInTheDocument();
	});

	it("drops the Shot here section when there are no credits", () => {
		renderWithTheme(<SpaceFacts space={demoDetail} />);

		expect(screen.queryByRole("heading", { name: "Shot here" })).not.toBeInTheDocument();
	});
});
