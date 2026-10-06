import { screen } from "@testing-library/react";
import ThreadSummary from "@/app/_components/ThreadSummary";
import { demoThread, renderWithTheme } from "@/app/_components/testing";

it("names the space, links to the listing and shows the counterpart and status", () => {
	renderWithTheme(<ThreadSummary thread={demoThread} />);
	expect(screen.getByRole("heading", { level: 1, name: "[DEMO] Corner loft with afternoon light" })).toBeInTheDocument();
	expect(screen.getByRole("link", { name: "View listing" })).toHaveAttribute("href", "/spaces/demo-poblacion-loft");
	expect(screen.getByText("With Demo Host A · Poblacion, Makati")).toBeInTheDocument();
	expect(screen.getByText("Replied")).toBeInTheDocument();
});

it("lists the inquiry details that were given", () => {
	renderWithTheme(<ThreadSummary thread={demoThread} />);
	const details = screen.getByRole("list", { name: "Inquiry details" });
	expect(details).toHaveTextContent("Shoot date");
	expect(details).toHaveTextContent("20 Oct 2026");
	expect(details).toHaveTextContent("6 hours");
	expect(details).toHaveTextContent("Crew of 12");
	expect(details).toHaveTextContent("Commercial");
	expect(details).not.toHaveTextContent("Budget");
});

it("shows the requester's company to the host only", () => {
	const { unmount } = renderWithTheme(<ThreadSummary thread={demoThread} />);
	expect(screen.queryByText("Demo Films")).not.toBeInTheDocument();
	unmount();
	renderWithTheme(<ThreadSummary thread={{ ...demoThread, role: "HOST", counterpartName: "Demo Renter" }} />);
	expect(screen.getByText("Demo Films")).toBeInTheDocument();
});
