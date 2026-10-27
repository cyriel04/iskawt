import { screen } from "@testing-library/react";
import DemoListingTile from "@/app/_components/DemoListingTile";
import { renderWithTheme } from "@/app/_components/testing";

it("says the listing is not real", () => {
	renderWithTheme(<DemoListingTile />);
	expect(
		screen.getByText("Demo listing, for internal use only. Photos, rates and host are not real."),
	).toBeInTheDocument();
});
