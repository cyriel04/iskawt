import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportDialog from "@/app/_components/ReportDialog";
import { renderWithTheme } from "@/app/_components/testing";

const mockFetch = jest.fn();
const onClose = jest.fn();
const onBlocked = jest.fn();
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) });
// Routes fetch by endpoint.
const route = (handlers: { report?: () => unknown; block?: () => unknown }) =>
	mockFetch.mockImplementation((url: string) =>
		Promise.resolve(url.endsWith("/block") ? handlers.block?.() : handlers.report?.()),
	);

beforeEach(() => {
	mockFetch.mockReset();
	onClose.mockReset();
	onBlocked.mockReset();
	global.fetch = mockFetch;
});

const props = { inquiryId: "inq_demo", counterpartName: "Demo Host A", open: true, onClose, onBlocked };
const dialog = () => screen.getByRole("dialog", { name: "Report conversation" });
const send = () => userEvent.click(screen.getByRole("button", { name: "Send report" }));

it("labels every reason, the details field with a counter, and the block option", () => {
	renderWithTheme(<ReportDialog {...props} />);
	const group = within(dialog()).getByRole("radiogroup");
	expect(within(group).getAllByRole("radio")).toHaveLength(5);
	for (const label of ["Spam", "Scam or phishing", "Harassment", "Not their space to list", "Something else"]) {
		expect(screen.getByLabelText(label)).toBeInTheDocument();
	}
	expect(screen.getByRole("group", { name: "Reason" })).toBeInTheDocument();
	expect(screen.getByLabelText("Details (optional)")).toBeInTheDocument();
	expect(screen.getByText("0/1000")).toBeInTheDocument();
	expect(screen.getByLabelText("Also block Demo Host A")).not.toBeChecked();
	expect(screen.getByText("Reports go to the Iskawt team. Demo Host A isn't told.")).toBeInTheDocument();
});

it("renders nothing while closed", () => {
	renderWithTheme(<ReportDialog {...props} open={false} />);
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("asks for a reason on the client and doesn't post", async () => {
	renderWithTheme(<ReportDialog {...props} />);
	await send();
	expect(screen.getByText("Choose a reason.")).toBeInTheDocument();
	expect(mockFetch).not.toHaveBeenCalled();
});

it("counts characters, not UTF-16 units, and refuses more than 1000", async () => {
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Details (optional)"));
	await userEvent.paste("🎬🎬");
	expect(screen.getByText("2/1000")).toBeInTheDocument();
	await userEvent.paste("x".repeat(999));
	await userEvent.click(screen.getByLabelText("Spam"));
	await send();
	expect(screen.getByText("Keep it under 1000 characters.")).toBeInTheDocument();
	expect(mockFetch).not.toHaveBeenCalled();
});

it("posts the reason and trimmed detail, then thanks; no block when unchecked", async () => {
	route({ report: () => reply(201, { id: "rep_1" }) });
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Scam or phishing"));
	await userEvent.type(screen.getByLabelText("Details (optional)"), "  Asked for a deposit  ");
	await send();
	expect(await screen.findByText("Thanks. Someone from Iskawt will look at this.")).toBeInTheDocument();
	expect(mockFetch).toHaveBeenCalledTimes(1);
	expect(mockFetch).toHaveBeenCalledWith(
		"/api/inquiries/inq_demo/report",
		expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "SCAM_OR_PHISHING", detail: "Asked for a deposit" }) }),
	);
	expect(onBlocked).not.toHaveBeenCalled();
	await userEvent.click(screen.getByRole("button", { name: "Done" }));
	expect(onClose).toHaveBeenCalled();
});

it("with Also block: reports, then blocks, then calls onBlocked", async () => {
	route({ report: () => reply(201, { id: "rep_1" }), block: () => reply(200, { blockedByMe: true }) });
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Harassment"));
	await userEvent.click(screen.getByLabelText("Also block Demo Host A"));
	await send();
	expect(await screen.findByText("Thanks. Someone from Iskawt will look at this.")).toBeInTheDocument();
	expect(mockFetch.mock.calls.map(([url]: [string]) => url)).toEqual(["/api/inquiries/inq_demo/report", "/api/inquiries/inq_demo/block"]);
	expect(mockFetch.mock.calls[1][1]).toEqual(expect.objectContaining({ method: "POST" }));
	expect(onBlocked).toHaveBeenCalledTimes(1);
});

it.each([
	["409 NOT_LINKED", () => reply(409, { error: "NOT_LINKED" }), "You can block this host once they've joined Iskawt."],
	["a server error", () => reply(500, {}), "We couldn't block Demo Host A. You can try again from the More menu."],
	["a network error", () => Promise.reject(new Error("offline")), "We couldn't block Demo Host A. You can try again from the More menu."],
])("report sent but block failed (%s): thanks, a note, no onBlocked", async (_label, block, note) => {
	route({ report: () => reply(201, { id: "rep_1" }), block });
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Spam"));
	await userEvent.click(screen.getByLabelText("Also block Demo Host A"));
	await send();
	expect(await screen.findByText("Thanks. Someone from Iskawt will look at this.")).toBeInTheDocument();
	expect(screen.getByText(note)).toBeInTheDocument();
	expect(onBlocked).not.toHaveBeenCalled();
});

it.each([
	[429, { error: "RATE_LIMITED" }, "You've sent a lot of reports today. Try again tomorrow."],
	[404, { error: "NOT_FOUND" }, "This conversation is no longer available."],
	[500, {}, "We couldn't send that report. Try again."],
])("shows the error for %i and keeps the form", async (status, body, text) => {
	route({ report: () => reply(status, body) });
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Spam"));
	await send();
	expect(await screen.findByText(text)).toBeInTheDocument();
	expect(screen.getByLabelText("Spam")).toBeChecked();
	expect(screen.getByRole("button", { name: "Send report" })).toBeEnabled();
});

it("shows server field errors from a 400", async () => {
	route({ report: () => reply(400, { error: "VALIDATION", fields: { detail: "Remove unsupported characters." } }) });
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Spam"));
	await send();
	expect(await screen.findByText("Remove unsupported characters.")).toBeInTheDocument();
});

it("on 401 links back to sign-in for this thread", async () => {
	route({ report: () => reply(401, { error: "UNAUTHENTICATED" }) });
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Spam"));
	await send();
	expect(await screen.findByText(/Your session ended\./)).toBeInTheDocument();
	expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/sign-in?next=%2Finbox%2Finq_demo");
});

it("on a network error says so and re-enables the button", async () => {
	mockFetch.mockRejectedValue(new Error("offline"));
	renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Spam"));
	await send();
	expect(await screen.findByText("We couldn't send that report. Try again.")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Send report" })).toBeEnabled();
});

it("Cancel and Escape close without posting, and reopening shows a clean form", async () => {
	const { rerender } = renderWithTheme(<ReportDialog {...props} />);
	await userEvent.click(screen.getByLabelText("Spam"));
	await userEvent.type(screen.getByLabelText("Details (optional)"), "draft");
	await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(onClose).toHaveBeenCalledTimes(1);
	await userEvent.keyboard("{Escape}");
	expect(onClose).toHaveBeenCalledTimes(2);
	expect(mockFetch).not.toHaveBeenCalled();
	rerender(<ReportDialog {...props} open={false} />);
	rerender(<ReportDialog {...props} open />);
	expect(screen.getByLabelText("Spam")).not.toBeChecked();
	expect(screen.getByLabelText("Details (optional)")).toHaveValue("");
});
