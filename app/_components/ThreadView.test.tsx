import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThreadView from "@/app/_components/ThreadView";
import { demoThread, renderWithTheme } from "@/app/_components/testing";

const mockFetch = jest.fn();
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) });
let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
	jest.useFakeTimers();
	mockFetch.mockReset();
	global.fetch = mockFetch;
	visibility = "visible";
	Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => jest.useRealTimers());

const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
// Lets an awaited fetch in a click handler settle. user-event's own drain under
// fake timers ends before the handler's fetch → json → setState chain does.
const tick = (s: number) => act(async () => { await jest.advanceTimersByTimeAsync(s * 1000); });
const setVisibility = (v: DocumentVisibilityState) =>
	act(() => {
		visibility = v;
		document.dispatchEvent(new Event("visibilitychange"));
	});
const messages = () => within(screen.getByRole("list", { name: "Messages" })).getAllByRole("listitem");

it("renders the messages oldest first with sender and time", () => {
	renderWithTheme(<ThreadView thread={demoThread} />);
	const items = messages();
	expect(items).toHaveLength(2);
	expect(items[0]).toHaveTextContent("Demo Renter");
	expect(items[0]).toHaveTextContent("Free on the 20th?");
	expect(items[1]).toHaveTextContent("Demo Host A");
	expect(items[1]).toHaveTextContent("7 Oct, 6:00 PM");
});

it("polls every 15 s with a 5 s-overlap cursor and appends without duplicates", async () => {
	mockFetch.mockResolvedValue(
		reply(200, {
			status: "RESPONDED",
			messages: [demoThread.messages[1], { id: "m3", body: "See you then", sentAt: "2026-10-07T10:05:00.000Z", fromMe: false, senderName: "Demo Host A" }],
		}),
	);
	renderWithTheme(<ThreadView thread={demoThread} />);
	expect(mockFetch).not.toHaveBeenCalled();
	await tick(15);
	expect(mockFetch).toHaveBeenCalledWith("/api/inquiries/inq_demo/messages?after=m1", expect.objectContaining({ cache: "no-store" }));
	expect(messages()).toHaveLength(3);
	expect(messages()[2]).toHaveTextContent("See you then");
});

it("doesn't poll while the tab is hidden, and polls at once when it's visible again", async () => {
	mockFetch.mockResolvedValue(reply(200, { status: "RESPONDED", messages: [] }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	setVisibility("hidden");
	await tick(3600);
	expect(mockFetch).not.toHaveBeenCalled();
	setVisibility("visible");
	await tick(0);
	expect(mockFetch).toHaveBeenCalledTimes(1);
});

it("stops polling on unmount", async () => {
	mockFetch.mockResolvedValue(reply(200, { status: "RESPONDED", messages: [] }));
	const { unmount } = renderWithTheme(<ThreadView thread={demoThread} />);
	unmount();
	await tick(60);
	expect(mockFetch).not.toHaveBeenCalled();
});

it("goes read-only when a poll reports the thread was closed", async () => {
	mockFetch.mockResolvedValue(reply(200, { status: "CLOSED", messages: [] }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	await tick(15);
	expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
	expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "Close conversation" })).not.toBeInTheDocument();
});

it("stops polling and asks to sign in again on 401", async () => {
	mockFetch.mockResolvedValue(reply(401, { error: "UNAUTHENTICATED" }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	await tick(15);
	const alert = screen.getByRole("alert");
	expect(alert).toHaveTextContent("Your session ended.");
	expect(within(alert).getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/sign-in?next=%2Finbox%2Finq_demo");
	await tick(60);
	expect(mockFetch).toHaveBeenCalledTimes(1);
});

it("stops polling on 404 and says the conversation is gone", async () => {
	mockFetch.mockResolvedValue(reply(404, { error: "NOT_FOUND" }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	await tick(15);
	expect(screen.getByRole("alert")).toHaveTextContent("This conversation is no longer available.");
	await tick(60);
	expect(mockFetch).toHaveBeenCalledTimes(1);
});

it("sends a reply, appends it and clears the box", async () => {
	const sent = { id: "m9", body: "Great, thanks", sentAt: "2026-10-07T10:10:00.000Z", fromMe: true, senderName: "Demo Renter" };
	mockFetch.mockResolvedValue(reply(201, { message: sent }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().type(screen.getByLabelText("Reply"), "  Great, thanks  ");
	await user().click(screen.getByRole("button", { name: "Send" }));
	await tick(0);
	expect(mockFetch).toHaveBeenCalledWith(
		"/api/inquiries/inq_demo/messages",
		expect.objectContaining({ method: "POST", body: JSON.stringify({ body: "Great, thanks" }) }),
	);
	expect(messages()).toHaveLength(3);
	expect(screen.getByLabelText("Reply")).toHaveValue("");
});

it("validates the reply on the client", async () => {
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().click(screen.getByRole("button", { name: "Send" }));
	expect(screen.getByText("Write a message.")).toBeInTheDocument();
	expect(mockFetch).not.toHaveBeenCalled();
});

it("on 409 keeps the typed text, disables the box and says it was closed", async () => {
	mockFetch.mockResolvedValue(reply(409, { error: "THREAD_CLOSED" }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().type(screen.getByLabelText("Reply"), "Still on?");
	await user().click(screen.getByRole("button", { name: "Send" }));
	await tick(0);
	expect(screen.getByRole("alert")).toHaveTextContent("This conversation was closed.");
	expect(screen.getByLabelText("Reply")).toHaveValue("Still on?");
	expect(screen.getByLabelText("Reply")).toBeDisabled();
});

it("shows the rate-limit and generic errors and keeps the text", async () => {
	mockFetch.mockResolvedValueOnce(reply(429, { error: "RATE_LIMITED" }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().type(screen.getByLabelText("Reply"), "Hello");
	await user().click(screen.getByRole("button", { name: "Send" }));
	await tick(0);
	expect(screen.getByRole("alert")).toHaveTextContent("You've sent a lot of messages. Try again later.");
	mockFetch.mockRejectedValueOnce(new Error("offline"));
	await user().click(screen.getByRole("button", { name: "Send" }));
	await tick(0);
	expect(screen.getByRole("alert")).toHaveTextContent("We couldn't send that. Try again.");
	expect(screen.getByLabelText("Reply")).toHaveValue("Hello");
});

it("confirms in the page before closing, then goes read-only", async () => {
	mockFetch.mockResolvedValue(reply(200, { status: "CLOSED" }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().click(screen.getByRole("button", { name: "Close conversation" }));
	expect(screen.getByText("Close this conversation? Neither of you can send more messages.")).toBeInTheDocument();
	expect(mockFetch).not.toHaveBeenCalled();
	await user().click(screen.getByRole("button", { name: "Yes, close it" }));
	await tick(0);
	expect(mockFetch).toHaveBeenCalledWith(
		"/api/inquiries/inq_demo/status",
		expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "close" }) }),
	);
	expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
});

it("cancelling the confirmation sends nothing", async () => {
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().click(screen.getByRole("button", { name: "Close conversation" }));
	await user().click(screen.getByRole("button", { name: "Cancel" }));
	expect(mockFetch).not.toHaveBeenCalled();
	expect(screen.getByRole("button", { name: "Close conversation" })).toBeInTheDocument();
});

it("offers Decline only to the host", async () => {
	const { unmount } = renderWithTheme(<ThreadView thread={demoThread} />);
	expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
	unmount();
	mockFetch.mockResolvedValue(reply(200, { status: "DECLINED" }));
	renderWithTheme(<ThreadView thread={{ ...demoThread, role: "HOST", canDecline: true }} />);
	await user().click(screen.getByRole("button", { name: "Decline" }));
	await user().click(screen.getByRole("button", { name: "Yes, decline" }));
	await tick(0);
	expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ action: "decline" });
	expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
});

it("renders read-only from the start for a closed thread and doesn't poll", async () => {
	renderWithTheme(<ThreadView thread={{ ...demoThread, status: "DECLINED", canReply: false, canClose: false }} />);
	expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
	await tick(60);
	expect(mockFetch).not.toHaveBeenCalled();
});
