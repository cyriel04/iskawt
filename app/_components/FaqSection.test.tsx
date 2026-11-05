import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FaqSection from "@/app/_components/FaqSection";
import { renderWithTheme } from "@/app/_components/testing";
import { FAQ_GROUPS } from "@/app/_lib/constants/faq";
import { MAGIC_LINK_TTL_MINUTES } from "@/app/_lib/constants/limits";
import { CONTACT_EMAIL } from "@/app/_lib/constants/site";

describe("FaqSection", () => {
	it('renders a section with id "faq" labelled "Questions"', () => {
		renderWithTheme(<FaqSection />);

		expect(screen.getByRole("region", { name: "Questions" })).toHaveAttribute("id", "faq");
	});

	it("renders the renter and host groups as h3s", () => {
		renderWithTheme(<FaqSection />);

		expect(screen.getByRole("heading", { level: 3, name: "For renters" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { level: 3, name: "For hosts" })).toBeInTheDocument();
	});

	it("renders each question as an h4, collapsed", () => {
		renderWithTheme(<FaqSection />);

		expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(15);
		expect(screen.getByRole("button", { name: "Why can't I see the exact address?" })).toHaveAttribute(
			"aria-expanded",
			"false",
		);
	});

	it("opens a question from the keyboard", async () => {
		const user = userEvent.setup();
		renderWithTheme(<FaqSection />);
		const question = screen.getByRole("button", { name: "Are the rates final?" });

		act(() => question.focus());
		await user.keyboard("{Enter}");

		expect(question).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByText(/Rates are indicative and set by each host/)).toBeVisible();
	});

	it("says listing is free", async () => {
		const user = userEvent.setup();
		renderWithTheme(<FaqSection />);

		await user.click(screen.getByRole("button", { name: "Does it cost anything to list?" }));

		expect(screen.getByText("Free to list. No payment goes through Iskawt.")).toBeVisible();
	});

	it("gives the permit answer without rules advice", async () => {
		const user = userEvent.setup();
		renderWithTheme(<FaqSection />);

		await user.click(screen.getByRole("button", { name: "Do I need a permit?" }));

		expect(
			screen.getByText("Iskawt doesn't handle permits. Ask your host what the building or community needs."),
		).toBeVisible();
		expect(screen.getByRole("region", { name: "Questions" }).textContent).not.toMatch(/barangay|LGU/i);
	});

	it("builds the sign-in expiry from MAGIC_LINK_TTL_MINUTES", () => {
		renderWithTheme(<FaqSection />);

		const [answer] = screen.getAllByText(/sign-in link/);
		expect(answer).toHaveTextContent(`expires in ${MAGIC_LINK_TTL_MINUTES} minutes`);
	});

	it("ends with a contact line", async () => {
		renderWithTheme(<FaqSection />);
		const region = screen.getByRole("region", { name: "Questions" });

		expect(region).toHaveTextContent("Still have questions?");
		const link = screen.getByRole("link", { name: CONTACT_EMAIL });
		expect(link).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
		expect(region).toContainElement(link);
		// Open the last accordion: its answer region comes before the link, and
		// does not contain it.
		const lastQuestion = screen.getAllByRole("button", { name: "What if someone makes me uncomfortable?" }).at(-1);
		expect(lastQuestion).toBeDefined();
		if (lastQuestion !== undefined) await userEvent.setup().click(lastQuestion);
		const lastAnswer = screen.getByRole("region", { name: "What if someone makes me uncomfortable?" });
		expect(lastAnswer).toBeDefined();
		expect(lastAnswer?.compareDocumentPosition(link)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	});

	it('shares the "both" items between groups', () => {
		const [renters, hosts] = FAQ_GROUPS;

		expect(renters?.items.at(-1)).toBeDefined();
		expect(renters?.items.at(-1)).toBe(hosts?.items.at(-1));
		expect(renters?.items.at(-2)).toBeDefined();
		expect(renters?.items.at(-2)).toBe(hosts?.items.at(-2));
	});
});
