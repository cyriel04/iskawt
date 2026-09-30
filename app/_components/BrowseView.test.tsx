import { screen, within } from "@testing-library/react";
import BrowseView from "@/app/_components/BrowseView";
import { demoCard, renderWithTheme } from "@/app/_components/testing";
import { EMPTY_FILTERS } from "@/app/_lib/spaceFilters";
import type { SpaceFilters, SpaceSearchResult } from "@/app/_lib/types";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// DEMO fixtures. No real host or space.
const second = { ...demoCard, slug: "demo-kapitolyo-rowhouse", title: "[DEMO] Two-storey rowhouse", city: "PASIG" as const };

function result(overrides: Partial<SpaceSearchResult> = {}): SpaceSearchResult {
	return { spaces: [demoCard, second], total: 2, page: 1, pageSize: 12, pageCount: 1, ...overrides };
}

const filtered: SpaceFilters = {
	q: "white cyc",
	cities: ["MAKATI", "PASIG"],
	types: ["STUDIO"],
	setting: "OUTDOOR",
	naturalLight: ["ABUNDANT", "NONE"],
	minCrew: 10,
	hourlyRate: { min: 1000, max: 3000 },
	page: 2,
};

describe("BrowseView", () => {
	describe("controls", () => {
		it("offers search and the filter panel", () => {
			renderWithTheme(<BrowseView filters={EMPTY_FILTERS} result={result()} />);

			expect(screen.getByRole("searchbox", { name: "Search spaces" })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "All filters" })).toBeInTheDocument();
		});
	});

	describe("results count", () => {
		it("counts every match, not just this page, in a polite live region", () => {
			renderWithTheme(<BrowseView filters={EMPTY_FILTERS} result={result({ total: 30, pageCount: 3 })} />);

			const count = screen.getByText("30 spaces");
			expect(count).toHaveAttribute("aria-live", "polite");
		});

		it("uses the singular for one match", () => {
			renderWithTheme(<BrowseView filters={EMPTY_FILTERS} result={result({ spaces: [demoCard], total: 1 })} />);

			expect(screen.getByText("1 space")).toBeInTheDocument();
		});
	});

	describe("results", () => {
		it("renders one card per space on this page", () => {
			renderWithTheme(<BrowseView filters={EMPTY_FILTERS} result={result()} />);

			const grid = screen.getByRole("region", { name: "Spaces" });
			expect(within(grid).getAllByRole("listitem")).toHaveLength(2);
			expect(within(grid).getByRole("link", { name: /Corner loft/ })).toHaveAttribute(
				"href",
				"/spaces/demo-poblacion-loft",
			);
		});
	});

	describe("active filter chips", () => {
		function chips() {
			return within(screen.getByRole("list", { name: "Active filters" }));
		}

		it("shows none, and no Clear all, when nothing is filtered", () => {
			renderWithTheme(<BrowseView filters={EMPTY_FILTERS} result={result()} />);

			expect(screen.queryByRole("list", { name: "Active filters" })).not.toBeInTheDocument();
			expect(screen.queryByRole("link", { name: "Clear all" })).not.toBeInTheDocument();
		});

		it.each([
			["Remove search “white cyc”", "/?city=makati&city=pasig&type=studio&setting=outdoor&light=abundant&light=none&crew=10&rateMin=1000&rateMax=3000"],
			["Remove Makati", "/?q=white+cyc&city=pasig&type=studio&setting=outdoor&light=abundant&light=none&crew=10&rateMin=1000&rateMax=3000"],
			["Remove Pasig", "/?q=white+cyc&city=makati&type=studio&setting=outdoor&light=abundant&light=none&crew=10&rateMin=1000&rateMax=3000"],
			["Remove Studio", "/?q=white+cyc&city=makati&city=pasig&setting=outdoor&light=abundant&light=none&crew=10&rateMin=1000&rateMax=3000"],
			["Remove Outdoor", "/?q=white+cyc&city=makati&city=pasig&type=studio&light=abundant&light=none&crew=10&rateMin=1000&rateMax=3000"],
			["Remove Abundant light", "/?q=white+cyc&city=makati&city=pasig&type=studio&setting=outdoor&light=none&crew=10&rateMin=1000&rateMax=3000"],
			["Remove No natural light", "/?q=white+cyc&city=makati&city=pasig&type=studio&setting=outdoor&light=abundant&crew=10&rateMin=1000&rateMax=3000"],
			["Remove Crew of 10+", "/?q=white+cyc&city=makati&city=pasig&type=studio&setting=outdoor&light=abundant&light=none&rateMin=1000&rateMax=3000"],
			["Remove ₱1,000–₱3,000/hour", "/?q=white+cyc&city=makati&city=pasig&type=studio&setting=outdoor&light=abundant&light=none&crew=10"],
		])("%s removes only that value and goes back to page 1", (name, href) => {
			renderWithTheme(<BrowseView filters={filtered} result={result({ page: 2, pageCount: 2, total: 14 })} />);

			expect(chips().getByRole("link", { name })).toHaveAttribute("href", href);
		});

		it("has one chip per active value", () => {
			renderWithTheme(<BrowseView filters={filtered} result={result()} />);

			expect(chips().getAllByRole("link")).toHaveLength(9);
		});

		it("labels one-sided rate ranges", () => {
			renderWithTheme(
				<BrowseView filters={{ ...EMPTY_FILTERS, hourlyRate: { min: 1500, max: null } }} result={result()} />,
			);
			expect(chips().getByRole("link", { name: "Remove From ₱1,500/hour" })).toHaveAttribute("href", "/");
		});

		it("labels a maximum-only rate range", () => {
			renderWithTheme(
				<BrowseView filters={{ ...EMPTY_FILTERS, hourlyRate: { min: null, max: 2000 } }} result={result()} />,
			);
			expect(chips().getByRole("link", { name: "Remove Up to ₱2,000/hour" })).toBeInTheDocument();
		});

		it("clears everything at once", () => {
			renderWithTheme(<BrowseView filters={filtered} result={result()} />);

			expect(screen.getByRole("link", { name: "Clear all" })).toHaveAttribute("href", "/");
		});
	});

	describe("empty states", () => {
		const none = result({ spaces: [], total: 0, pageCount: 0 });

		it("says nothing matched and offers to clear filters when over-filtered", () => {
			renderWithTheme(<BrowseView filters={{ ...filtered, page: 1 }} result={none} />);

			expect(screen.getByRole("heading", { name: "No spaces match these filters" })).toBeInTheDocument();
			expect(screen.getByRole("link", { name: "Clear all filters" })).toHaveAttribute("href", "/");
			expect(screen.getByText("0 spaces")).toBeInTheDocument();
			expect(screen.queryByText("No spaces listed yet")).not.toBeInTheDocument();
			// The chips stay, so one filter can be removed at a time.
			expect(screen.getByRole("list", { name: "Active filters" })).toBeInTheDocument();
		});

		it("says nothing is listed yet when nothing is published at all", () => {
			renderWithTheme(<BrowseView filters={EMPTY_FILTERS} result={none} />);

			expect(screen.getByRole("heading", { name: "No spaces listed yet" })).toBeInTheDocument();
			expect(screen.queryByText("No spaces match these filters")).not.toBeInTheDocument();
			expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
		});

		it("offers a way back to page 1 when the page is past the last one", () => {
			renderWithTheme(
				<BrowseView
					filters={{ ...EMPTY_FILTERS, cities: ["MAKATI"], page: 9 }}
					result={result({ spaces: [], total: 14, page: 9, pageCount: 2 })}
				/>,
			);

			expect(screen.getByRole("heading", { name: "There is no page 9" })).toBeInTheDocument();
			expect(screen.getByRole("link", { name: "Back to page 1" })).toHaveAttribute("href", "/?city=makati");
			expect(screen.getByText("14 spaces")).toBeInTheDocument();
		});
	});

	describe("pagination", () => {
		function pager() {
			return within(screen.getByRole("navigation", { name: "Pages" }));
		}

		it("is absent when everything fits on one page", () => {
			renderWithTheme(<BrowseView filters={EMPTY_FILTERS} result={result()} />);

			expect(screen.queryByRole("navigation", { name: "Pages" })).not.toBeInTheDocument();
		});

		it("links to the previous and next pages, keeping the filters", () => {
			const filters = { ...EMPTY_FILTERS, cities: ["MAKATI" as const], page: 2 };
			renderWithTheme(<BrowseView filters={filters} result={result({ total: 30, page: 2, pageCount: 3 })} />);

			expect(pager().getByRole("link", { name: "Previous page" })).toHaveAttribute("href", "/?city=makati");
			expect(pager().getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/?city=makati&page=3");
			expect(pager().getByText("Page 2 of 3")).toBeInTheDocument();
		});

		it("has no previous link on the first page and no next link on the last", () => {
			const { unmount } = renderWithTheme(
				<BrowseView filters={EMPTY_FILTERS} result={result({ total: 30, page: 1, pageCount: 3 })} />,
			);
			expect(pager().queryByRole("link", { name: "Previous page" })).not.toBeInTheDocument();
			expect(pager().getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/?page=2");
			unmount();

			renderWithTheme(
				<BrowseView filters={{ ...EMPTY_FILTERS, page: 3 }} result={result({ total: 30, page: 3, pageCount: 3 })} />,
			);
			expect(pager().getByRole("link", { name: "Previous page" })).toHaveAttribute("href", "/?page=2");
			expect(pager().queryByRole("link", { name: "Next page" })).not.toBeInTheDocument();
		});
	});
});
