import { screen } from "@testing-library/react";
import DemoBanner from "@/app/_components/DemoBanner";
import { renderWithTheme } from "@/app/_components/testing";

it("is a labelled note saying the listings are sample data", () => {
	renderWithTheme(<DemoBanner />);
	const note = screen.getByRole("note", { name: "Demo site" });
	expect(note).toHaveTextContent("This is a demo. Every listing is sample data.");
});
