import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import { BrowseControls } from "@/app/_components/BrowseControls";
import { renderWithTheme } from "@/app/_components/testing";
import theme from "@/app/_lib/theme";
import { EMPTY_FILTERS } from "@/app/_lib/spaceFilters";
import type { SpaceFilters } from "@/app/_lib/types";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => push.mockReset());

const filtered: SpaceFilters = {
	...EMPTY_FILTERS,
	q: "loft",
	cities: ["MAKATI"],
	minCrew: 10,
	page: 3,
};

describe("SearchBox", () => {
	it("is a labelled search field showing the current search", () => {
		renderWithTheme(<BrowseControls filters={filtered} />);

		expect(screen.getByRole("search")).toBeInTheDocument();
		expect(screen.getByRole("searchbox", { name: "Search spaces" })).toHaveValue("loft");
	});

	it("searches on Enter, keeping other filters and going back to page 1", async () => {
		renderWithTheme(<BrowseControls filters={filtered} />);
		const box = screen.getByRole("searchbox", { name: "Search spaces" });

		await userEvent.clear(box);
		await userEvent.type(box, "  white    cyc {Enter}");

		expect(push).toHaveBeenCalledWith("/?q=white+cyc&city=makati&crew=10");
	});

	it("drops the search when submitted blank", async () => {
		renderWithTheme(<BrowseControls filters={filtered} />);

		await userEvent.clear(screen.getByRole("searchbox", { name: "Search spaces" }));
		await userEvent.click(screen.getByRole("button", { name: "Search" }));

		expect(push).toHaveBeenCalledWith("/?city=makati&crew=10");
	});

	it("still works as a plain GET form before hydration", () => {
		renderWithTheme(<BrowseControls filters={filtered} />);
		const form = screen.getByRole("search");

		expect(form).toHaveAttribute("action", "/");
		expect(form).toHaveAttribute("method", "get");
		// Other filters ride along as hidden fields; page is dropped.
		expect(form.querySelector('input[type="hidden"][name="city"]')).toHaveValue("makati");
		expect(form.querySelector('input[type="hidden"][name="crew"]')).toHaveValue("10");
		expect(form.querySelector('input[name="page"]')).toBeNull();
	});
});

describe("FilterPanel", () => {
	async function open(filters: SpaceFilters = filtered) {
		renderWithTheme(<BrowseControls filters={filters} />);
		await userEvent.click(screen.getByRole("button", { name: "All filters" }));
		return screen.getByRole("dialog", { name: "Filters" });
	}

	it("opens a labelled dialog from the All filters button", async () => {
		const dialog = await open();

		for (const legend of ["City", "Space type", "Setting", "Natural light"]) {
			expect(within(dialog).getByRole("group", { name: legend })).toBeInTheDocument();
		}
		expect(within(dialog).getByRole("spinbutton", { name: "Minimum crew" })).toHaveValue(10);
		expect(within(dialog).getByRole("spinbutton", { name: "Minimum hourly rate" })).toHaveValue(null);
		expect(within(dialog).getByRole("spinbutton", { name: "Maximum hourly rate" })).toBeInTheDocument();
		expect(within(dialog).getByText(/indicative/i)).toBeInTheDocument();
	});

	it("starts from the filters in the URL", async () => {
		const dialog = await open();

		expect(within(dialog).getByRole("checkbox", { name: "Makati" })).toBeChecked();
		expect(within(dialog).getByRole("checkbox", { name: "Pasig" })).not.toBeChecked();
		expect(within(dialog).getByRole("radio", { name: "Any" })).toBeChecked();
	});

	it("applies to a canonical URL on page 1, keeping the search", async () => {
		const dialog = await open();

		await userEvent.click(within(dialog).getByRole("checkbox", { name: "Pasig" }));
		await userEvent.click(within(dialog).getByRole("checkbox", { name: "Studio" }));
		await userEvent.click(within(dialog).getByRole("radio", { name: "Outdoor" }));
		await userEvent.click(within(dialog).getByRole("checkbox", { name: "Abundant" }));
		await userEvent.clear(within(dialog).getByRole("spinbutton", { name: "Minimum crew" }));
		await userEvent.type(within(dialog).getByRole("spinbutton", { name: "Minimum hourly rate" }), "3000");
		await userEvent.type(within(dialog).getByRole("spinbutton", { name: "Maximum hourly rate" }), "1000");
		await userEvent.click(within(dialog).getByRole("button", { name: "Show spaces" }));

		expect(push).toHaveBeenCalledWith(
			"/?q=loft&city=makati&city=pasig&type=studio&setting=outdoor&light=abundant&rateMin=1000&rateMax=3000",
		);
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
	});

	it("applies what is typed in the search box, even if it was never submitted", async () => {
		renderWithTheme(<BrowseControls filters={filtered} />);
		const box = screen.getByRole("searchbox", { name: "Search spaces" });
		await userEvent.clear(box);
		await userEvent.type(box, "  white   cyc ");

		await userEvent.click(screen.getByRole("button", { name: "All filters" }));
		const dialog = screen.getByRole("dialog", { name: "Filters" });
		await userEvent.click(within(dialog).getByRole("button", { name: "Show spaces" }));

		expect(push).toHaveBeenCalledWith("/?q=white+cyc&city=makati&crew=10");
	});

	it("drops the search when the box was cleared before applying", async () => {
		renderWithTheme(<BrowseControls filters={filtered} />);
		await userEvent.clear(screen.getByRole("searchbox", { name: "Search spaces" }));

		await userEvent.click(screen.getByRole("button", { name: "All filters" }));
		await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Show spaces" }));

		expect(push).toHaveBeenCalledWith("/?city=makati&crew=10");
	});

	it("caps the number inputs where the URL parser does", async () => {
		const dialog = await open();

		const crew = within(dialog).getByRole("spinbutton", { name: "Minimum crew" });
		expect(crew).toHaveAttribute("max", "999");
		expect(crew).toHaveAttribute("min", "1");
		expect(crew).toHaveAttribute("inputmode", "numeric");
		for (const name of ["Minimum hourly rate", "Maximum hourly rate"]) {
			const rate = within(dialog).getByRole("spinbutton", { name });
			expect(rate).toHaveAttribute("max", "999999");
			expect(rate).toHaveAttribute("min", "1");
			expect(rate).toHaveAttribute("inputmode", "numeric");
		}
	});

	it("renders All filters disabled in server HTML, before hydration can open it", () => {
		const html = renderToString(
			<ThemeProvider theme={theme}>
				<BrowseControls filters={filtered} />
			</ThemeProvider>,
		);
		const container = document.createElement("div");
		container.innerHTML = html;

		expect(within(container).getByRole("button", { name: "All filters" })).toBeDisabled();
		// The search form needs no JS, so it is never disabled.
		expect(within(container).getByRole("button", { name: "Search" })).toBeEnabled();
	});

	it("enables All filters once mounted", () => {
		renderWithTheme(<BrowseControls filters={filtered} />);

		expect(screen.getByRole("button", { name: "All filters" })).toBeEnabled();
	});

	it("closes without navigating", async () => {
		await open();

		await userEvent.click(screen.getByRole("button", { name: "Close filters" }));

		expect(push).not.toHaveBeenCalled();
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
	});
});
