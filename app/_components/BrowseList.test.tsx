import { screen } from "@testing-library/react";
import BrowseList from "@/app/_components/BrowseList";
import { listPublishedSpaces } from "@/app/_lib/server/spaces";
import { demoCard, renderWithTheme } from "@/app/_components/testing";

jest.mock("next/server", () => ({ connection: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/app/_lib/server/spaces", () => ({ listPublishedSpaces: jest.fn() }));

const mockList = jest.mocked(listPublishedSpaces);

describe("BrowseList", () => {
	it("lists published spaces", async () => {
		mockList.mockResolvedValue([demoCard]);

		renderWithTheme(await BrowseList());

		expect(screen.getByRole("link", { name: /Corner loft/ })).toBeInTheDocument();
	});

	it("shows the empty state when nothing is published", async () => {
		mockList.mockResolvedValue([]);

		renderWithTheme(await BrowseList());

		expect(screen.getByRole("heading", { name: "No spaces listed yet" })).toBeInTheDocument();
	});
});
