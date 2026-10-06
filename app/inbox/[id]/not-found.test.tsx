import { screen } from "@testing-library/react";
import ThreadNotFound from "@/app/inbox/[id]/not-found";
import { renderWithTheme } from "@/app/_components/testing";

it("says the conversation isn't available and links back to the inbox", () => {
	renderWithTheme(<ThreadNotFound />);
	expect(screen.getByRole("heading", { level: 1, name: "This conversation isn't available." })).toBeInTheDocument();
	expect(screen.getByRole("link", { name: "Go to your inbox" })).toHaveAttribute("href", "/inbox");
});
