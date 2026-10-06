import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InquiryForm from "@/app/_components/InquiryForm";
import { renderWithTheme } from "@/app/_components/testing";

// Exposes prefetch: a link to /inbox/[id] must not prefetch, because opening a
// thread marks it read.
jest.mock("next/link", () => ({
	__esModule: true,
	default: ({ prefetch, ...props }: { prefetch?: boolean } & Record<string, unknown>) => (
		<a data-prefetch={String(prefetch)} {...props} />
	),
}));

const props = { spaceSlug: "demo-poblacion-loft", hostName: "Demo Host A", respondsInHours: 12, today: "2026-10-07" };
const mockFetch = jest.fn();
beforeEach(() => {
	mockFetch.mockReset();
	global.fetch = mockFetch;
});
// jsdom has no Fetch API globals, so no `Response`: a stand-in with the parts the form reads.
const reply = (status: number, body: unknown) =>
	mockFetch.mockResolvedValue({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) });

async function fillRequired() {
	await userEvent.type(screen.getByLabelText("Your name"), "Demo Renter");
	await userEvent.type(screen.getByLabelText("Message"), "Free on the 20th?");
}
const submit = () => userEvent.click(screen.getByRole("button", { name: "Send inquiry" }));

it("labels every field and bounds the date input", () => {
	renderWithTheme(<InquiryForm {...props} />);
	for (const label of ["Your name", "Company (optional)", "Shoot date (optional)", "Hours needed (optional)", "Crew size (optional)", "Production type", "Budget note (optional)", "Message"]) {
		expect(screen.getByLabelText(label)).toBeInTheDocument();
	}
	expect(screen.getByLabelText("Shoot date (optional)")).toHaveAttribute("min", "2026-10-07");
	expect(screen.getByLabelText("Shoot date (optional)")).toHaveAttribute("max", "2027-10-07");
});

it("hides the spam trap from people and assistive tech", () => {
	const { container } = renderWithTheme(<InquiryForm {...props} />);
	const trap = container.querySelector('input[name="website"]');
	expect(trap).not.toBeNull();
	expect(trap).toHaveAttribute("tabindex", "-1");
	expect(trap).toHaveAttribute("autocomplete", "off");
	expect(trap?.closest('[aria-hidden="true"]')).not.toBeNull();
});

it("validates on the client with the shared rules and doesn't post", async () => {
	renderWithTheme(<InquiryForm {...props} />);
	await submit();
	expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
	expect(screen.getByText("Write a message.")).toBeInTheDocument();
	expect(mockFetch).not.toHaveBeenCalled();
});

it("posts the inquiry and shows the sent state with a link to the thread", async () => {
	reply(201, { id: "inq_new", reused: false });
	renderWithTheme(<InquiryForm {...props} />);
	await fillRequired();
	await submit();
	const status = await screen.findByRole("status");
	expect(status).toHaveTextContent("Sent. Demo Host A usually replies within 12 hours. We'll email you when they do.");
	expect(status).toHaveFocus();
	expect(within(status).getByRole("link", { name: "View conversation" })).toHaveAttribute("href", "/inbox/inq_new");
	expect(within(status).getByRole("link", { name: "View conversation" })).toHaveAttribute("data-prefetch", "false");
	const [url, init] = mockFetch.mock.calls[0];
	expect(url).toBe("/api/inquiries");
	expect(JSON.parse(init.body)).toMatchObject({ spaceSlug: "demo-poblacion-loft", requesterName: "Demo Renter", message: "Free on the 20th?", website: "" });
});

it("omits the reply-time sentence when the host hasn't set one", async () => {
	reply(201, { id: "inq_new", reused: false });
	renderWithTheme(<InquiryForm {...props} respondsInHours={null} />);
	await fillRequired();
	await submit();
	expect(await screen.findByRole("status")).toHaveTextContent("Sent. We'll email you when Demo Host A replies.");
});

it("explains a reused thread: details weren't updated", async () => {
	reply(200, { id: "inq_open", reused: true });
	renderWithTheme(<InquiryForm {...props} />);
	await fillRequired();
	await submit();
	expect(await screen.findByRole("status")).toHaveTextContent(
		"Added to your existing conversation. Dates, hours and crew size there weren't changed. Mention any changes in your message.",
	);
});

it("shows a sent state without a link for a null id", async () => {
	reply(201, { id: null, reused: false });
	renderWithTheme(<InquiryForm {...props} />);
	await fillRequired();
	await submit();
	const status = await screen.findByRole("status");
	expect(status).toHaveTextContent("Sent.");
	expect(within(status).queryByRole("link")).not.toBeInTheDocument();
});

it.each([
	[400, { error: "VALIDATION", fields: { shootDate: "Pick today or a later date." } }, "Pick today or a later date."],
	[400, { error: "OWN_SPACE" }, "You can't send an inquiry about your own listing."],
	[404, { error: "NOT_FOUND" }, "This listing isn't taking inquiries right now."],
	[429, { error: "RATE_LIMITED" }, "You've sent a lot of messages. Try again later."],
	[500, {}, "We couldn't send that. Try again."],
])("shows the error for %i %o", async (status, body, text) => {
	reply(status, body);
	renderWithTheme(<InquiryForm {...props} />);
	await fillRequired();
	await submit();
	expect(await screen.findByText(text)).toBeInTheDocument();
	expect(screen.getByRole("status")).toBeEmptyDOMElement();
	expect(screen.getByRole("button", { name: "Send inquiry" })).toBeEnabled();
});

it("on 401 links back to sign-in with next set to this listing", async () => {
	reply(401, { error: "UNAUTHENTICATED" });
	renderWithTheme(<InquiryForm {...props} />);
	await fillRequired();
	await submit();
	const alert = await screen.findByRole("alert");
	expect(alert).toHaveTextContent("Your session ended. Sign in again to send this.");
	expect(within(alert).getByRole("link", { name: "Sign in again" })).toHaveAttribute(
		"href",
		"/sign-in?next=%2Fspaces%2Fdemo-poblacion-loft",
	);
	expect(screen.getByRole("status")).toBeEmptyDOMElement();
	expect(screen.getByRole("status")).not.toHaveTextContent("Sent");
});

it("handles a network failure and disables the button while sending", async () => {
	let reject: (e: Error) => void = () => {};
	mockFetch.mockReturnValue(new Promise((_, r) => (reject = r)));
	renderWithTheme(<InquiryForm {...props} />);
	await fillRequired();
	await submit();
	expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
	reject(new Error("offline"));
	expect(await screen.findByText("We couldn't send that. Try again.")).toBeInTheDocument();
});
