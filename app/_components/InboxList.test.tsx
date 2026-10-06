import { screen, within } from "@testing-library/react";
import InboxList from "@/app/_components/InboxList";
import { demoSummary, renderWithTheme } from "@/app/_components/testing";

it("shows the empty state with a way to browse", () => {
	renderWithTheme(<InboxList items={[]} />);
	expect(screen.getByText("No conversations yet.")).toBeInTheDocument();
	expect(screen.getByRole("link", { name: "Browse spaces" })).toHaveAttribute("href", "/");
});

it("renders one list item per thread, linking to the thread", () => {
	renderWithTheme(<InboxList items={[demoSummary, { ...demoSummary, id: "inq_2", unread: false }]} />);
	const items = within(screen.getByRole("list", { name: "Conversations" })).getAllByRole("listitem");
	expect(items).toHaveLength(2);
	expect(within(items[0]).getByRole("link")).toHaveAttribute("href", "/inbox/inq_demo");
});

it("shows space, counterpart, role, preview, time, status and an unread marker", () => {
	renderWithTheme(<InboxList items={[demoSummary]} />);
	const item = screen.getByRole("listitem");
	expect(item).toHaveTextContent("[DEMO] Corner loft with afternoon light");
	expect(item).toHaveTextContent("Demo Host A");
	expect(item).toHaveTextContent("You asked");
	expect(item).toHaveTextContent("Yes, the 20th works.");
	expect(item).toHaveTextContent("7 Oct, 6:00 PM");
	expect(item).toHaveTextContent("Replied");
	expect(within(item).getByText("Unread")).toBeInTheDocument(); // visually hidden text for the dot
});

it("labels the host's own threads and prefixes your own last message", () => {
	renderWithTheme(
		<InboxList items={[{ ...demoSummary, role: "HOST", unread: false, lastMessage: { ...demoSummary.lastMessage, fromMe: true } }]} />,
	);
	const item = screen.getByRole("listitem");
	expect(item).toHaveTextContent("Your listing");
	expect(item).toHaveTextContent("You: Yes, the 20th works.");
	expect(within(item).queryByText("Unread")).not.toBeInTheDocument();
});
