import { screen, within } from "@testing-library/react";
import BrowseResults from "@/app/_components/BrowseResults";
import { demoCard, renderWithTheme } from "@/app/_components/testing";

const second = { ...demoCard, slug: "demo-kapitolyo-rowhouse", title: "[DEMO] Two-storey rowhouse" };

describe("BrowseResults", () => {
	it("renders one list item per space", () => {
		renderWithTheme(<BrowseResults spaces={[demoCard, second]} />);

		const list = screen.getByRole("list");
		expect(within(list).getAllByRole("listitem")).toHaveLength(2);
	});

	it("counts the spaces", () => {
		renderWithTheme(<BrowseResults spaces={[demoCard, second]} />);

		expect(screen.getByText("2 spaces")).toBeInTheDocument();
	});

	it("uses the singular for one space", () => {
		renderWithTheme(<BrowseResults spaces={[demoCard]} />);

		expect(screen.getByText("1 space")).toBeInTheDocument();
	});

	it("shows an empty state instead of an empty grid", () => {
		renderWithTheme(<BrowseResults spaces={[]} />);

		expect(screen.getByRole("heading", { name: "No spaces listed yet" })).toBeInTheDocument();
		expect(screen.queryByRole("list")).not.toBeInTheDocument();
	});
});
