import { screen } from "@testing-library/react";
import RatePanel from "@/app/_components/RatePanel";
import { demoDetail, renderWithTheme } from "@/app/_components/testing";

const { rates, rateNotes, host } = demoDetail;

describe("RatePanel", () => {
	it("lists each rate the host gave", () => {
		renderWithTheme(<RatePanel rates={rates} rateNotes={rateNotes} host={host} />);

		expect(screen.getByText("Per hour")).toBeInTheDocument();
		expect(screen.getByText("₱1,800")).toBeInTheDocument();
		expect(screen.getByText("Half day")).toBeInTheDocument();
		expect(screen.getByText("₱7,000")).toBeInTheDocument();
		expect(screen.getByText("Full day")).toBeInTheDocument();
		expect(screen.getByText("₱12,000")).toBeInTheDocument();
	});

	it("leaves out rates the host did not give", () => {
		renderWithTheme(<RatePanel rates={{ ...rates, halfDay: null }} rateNotes={rateNotes} host={host} />);

		expect(screen.queryByText("Half day")).not.toBeInTheDocument();
	});

	it("says the rate is on inquiry when there are none", () => {
		const none = { hourly: null, halfDay: null, fullDay: null, minimumHours: null };
		renderWithTheme(<RatePanel rates={none} rateNotes={null} host={host} />);

		expect(screen.getByText("Rate on inquiry")).toBeInTheDocument();
	});

	it("shows the minimum booking and the host's rate notes", () => {
		renderWithTheme(<RatePanel rates={rates} rateNotes={rateNotes} host={host} />);

		expect(screen.getByText("Minimum 3 hours")).toBeInTheDocument();
		expect(screen.getByText(/Overtime and cleaning to be agreed/)).toBeInTheDocument();
	});

	it("always says rates are indicative", () => {
		renderWithTheme(<RatePanel rates={rates} rateNotes={null} host={host} />);

		expect(screen.getByText(/Rates are indicative/)).toBeInTheDocument();
	});

	it("introduces the host by display name only", () => {
		renderWithTheme(<RatePanel rates={rates} rateNotes={rateNotes} host={host} />);

		expect(screen.getByText("Hosted by Demo Host A")).toBeInTheDocument();
		expect(screen.getByText("Verified host")).toBeInTheDocument();
		expect(screen.getByText("Usually replies within 12 hours.")).toBeInTheDocument();
	});

	it("uses the singular for a one-hour reply time", () => {
		renderWithTheme(<RatePanel rates={rates} rateNotes={null} host={{ ...host, respondsInHours: 1 }} />);

		expect(screen.getByText("Usually replies within 1 hour.")).toBeInTheDocument();
	});
});
