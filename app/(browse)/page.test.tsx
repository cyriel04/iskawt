import { screen } from "@testing-library/react";
import BrowsePage from "@/app/(browse)/page";
import { searchPublishedSpaces } from "@/app/_lib/server/spaces";
import { EMPTY_FILTERS } from "@/app/_lib/spaceFilters";
import type { RawSearchParams, SpaceCard, SpaceSearchResult } from "@/app/_lib/types";
import { demoCard, renderWithTheme } from "@/app/_components/testing";

jest.mock("next/server", () => ({ connection: jest.fn().mockResolvedValue(undefined) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/app/_lib/server/spaces", () => ({ searchPublishedSpaces: jest.fn() }));

const mockSearch = jest.mocked(searchPublishedSpaces);

function resultOf(spaces: SpaceCard[]): SpaceSearchResult {
	return { spaces, total: spaces.length, page: 1, pageSize: 12, pageCount: spaces.length > 0 ? 1 : 0 };
}

function render(params: RawSearchParams = {}) {
	return BrowsePage({ searchParams: Promise.resolve(params) });
}

describe("BrowsePage", () => {
	it("lists published spaces under the page heading", async () => {
		mockSearch.mockResolvedValue(resultOf([demoCard]));

		renderWithTheme(await render());

		expect(
			screen.getByRole("heading", { level: 1, name: "Shoot spaces in Metro Manila" }),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /Corner loft/ })).toBeInTheDocument();
	});

	it("says rates are indicative", async () => {
		mockSearch.mockResolvedValue(resultOf([demoCard]));

		renderWithTheme(await render());

		expect(screen.getByText(/Rates are indicative/)).toBeInTheDocument();
	});

	it("shows the empty state when nothing is published", async () => {
		mockSearch.mockResolvedValue(resultOf([]));

		renderWithTheme(await render());

		expect(screen.getByRole("heading", { name: "No spaces listed yet" })).toBeInTheDocument();
	});

	it("searches with no filters when the URL has none", async () => {
		mockSearch.mockResolvedValue(resultOf([]));

		await render();

		expect(mockSearch).toHaveBeenCalledWith(EMPTY_FILTERS);
	});

	it("searches with the filters parsed from the URL", async () => {
		mockSearch.mockResolvedValue(resultOf([]));

		await render({ q: "white cyc", city: ["makati", "pasig"], crew: "10", page: "2" });

		expect(mockSearch).toHaveBeenCalledWith({
			...EMPTY_FILTERS,
			q: "white cyc",
			cities: ["MAKATI", "PASIG"],
			minCrew: 10,
			page: 2,
		});
	});

	it("shows the over-filtered empty state when filters match nothing", async () => {
		mockSearch.mockResolvedValue(resultOf([]));

		renderWithTheme(await render({ city: "pateros" }));

		expect(screen.getByRole("heading", { name: "No spaces match these filters" })).toBeInTheDocument();
	});
});
