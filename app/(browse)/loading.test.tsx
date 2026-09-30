import { screen } from "@testing-library/react";
import { renderWithTheme } from "@/app/_components/testing";
import Loading from "./loading";

// Placeholders in document order, by shape: what a sighted user sees before
// the page arrives. Mirrors the page: heading, note, toolbar, summary, grid.
function shapes(main: HTMLElement): string[] {
	return [...main.querySelectorAll(".MuiSkeleton-root")].map((el) =>
		el.classList.contains("MuiSkeleton-text") ? "text" : "block",
	);
}

describe("Loading", () => {
	it("is a busy main landmark named Loading", () => {
		renderWithTheme(<Loading />);
		const main = screen.getByRole("main", { name: "Loading" });
		expect(main).toHaveAttribute("aria-busy", "true");
	});

	it("sketches the heading, the search toolbar, the filter summary and the grid, in page order", () => {
		renderWithTheme(<Loading />);
		const main = screen.getByRole("main", { name: "Loading" });

		expect(shapes(main)).toEqual([
			"text", // title
			"text", // indicative-rates note
			"block", // search field
			"block", // "All filters" button
			"block", // active-filter chip
			"text", // results count
			"block",
			"block",
			"block", // cards
		]);
	});

	it("offers nothing that looks usable while loading", () => {
		renderWithTheme(<Loading />);

		expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});
});
