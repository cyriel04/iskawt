import { screen } from "@testing-library/react";
import SiteHeader from "@/app/_components/SiteHeader";
import { renderWithTheme } from "@/app/_components/testing";

describe("SiteHeader", () => {
	it("renders a banner landmark", () => {
		renderWithTheme(<SiteHeader />);
		expect(screen.getByRole("banner")).toBeInTheDocument();
	});

	it("has exactly one link, named Iskawt, pointing home", () => {
		renderWithTheme(<SiteHeader />);
		const links = screen.getAllByRole("link");
		expect(links).toHaveLength(1);
		expect(screen.getByRole("link", { name: "Iskawt" })).toHaveAttribute("href", "/");
	});

	it("does not render the wordmark as a heading", () => {
		renderWithTheme(<SiteHeader />);
		expect(screen.queryByRole("heading")).not.toBeInTheDocument();
	});

	it("has no navigation or buttons yet", () => {
		renderWithTheme(<SiteHeader />);
		expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});
});
