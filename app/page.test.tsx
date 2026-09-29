import { screen } from "@testing-library/react";
import BrowsePage from "@/app/page";
import { renderWithTheme } from "@/app/_components/testing";

jest.mock("@/app/_components/BrowseList", () => ({
	__esModule: true,
	default: () => <p>browse list</p>,
}));

describe("BrowsePage", () => {
	it("shows the page heading", () => {
		renderWithTheme(<BrowsePage />);

		expect(
			screen.getByRole("heading", { level: 1, name: "Shoot spaces in Metro Manila" }),
		).toBeInTheDocument();
	});

	it("says rates are indicative", () => {
		renderWithTheme(<BrowsePage />);

		expect(screen.getByText(/Rates are indicative/)).toBeInTheDocument();
	});

	it("renders the browse list", () => {
		renderWithTheme(<BrowsePage />);

		expect(screen.getByText("browse list")).toBeInTheDocument();
	});
});
