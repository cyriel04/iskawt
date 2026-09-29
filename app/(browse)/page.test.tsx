import { screen } from "@testing-library/react";
import BrowsePage from "@/app/(browse)/page";
import { listPublishedSpaces } from "@/app/_lib/server/spaces";
import { demoCard, renderWithTheme } from "@/app/_components/testing";

jest.mock("next/server", () => ({ connection: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/app/_lib/server/spaces", () => ({ listPublishedSpaces: jest.fn() }));

const mockList = jest.mocked(listPublishedSpaces);

describe("BrowsePage", () => {
	it("lists published spaces under the page heading", async () => {
		mockList.mockResolvedValue([demoCard]);

		renderWithTheme(await BrowsePage());

		expect(
			screen.getByRole("heading", { level: 1, name: "Shoot spaces in Metro Manila" }),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /Corner loft/ })).toBeInTheDocument();
	});

	it("says rates are indicative", async () => {
		mockList.mockResolvedValue([demoCard]);

		renderWithTheme(await BrowsePage());

		expect(screen.getByText(/Rates are indicative/)).toBeInTheDocument();
	});

	it("shows the empty state when nothing is published", async () => {
		mockList.mockResolvedValue([]);

		renderWithTheme(await BrowsePage());

		expect(screen.getByRole("heading", { name: "No spaces listed yet" })).toBeInTheDocument();
	});
});
