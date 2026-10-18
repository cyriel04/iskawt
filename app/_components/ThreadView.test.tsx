import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import theme from "@/app/_lib/theme";
import ThreadView from "@/app/_components/ThreadView";
import { demoThread, renderWithTheme } from "@/app/_components/testing";

const mockFetch = jest.fn();
const mockRefresh = jest.fn();
// A fresh router object per render, so an effect that depends on it re-runs
// on every render: the refresh guard has to hold on its own.
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) });
let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
	jest.useFakeTimers();
	mockFetch.mockReset();
	mockRefresh.mockReset();
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
const pending = () => new Promise<never>(() => {});
// Routes fetch by endpoint: GET messages (poll), POST messages (send), POST
// status, POST/DELETE block, POST report.
type Handlers = {
	poll?: () => Promise<unknown>;
	send?: () => Promise<unknown>;
	status?: () => Promise<unknown>;
	block?: () => Promise<unknown>;
	unblock?: () => Promise<unknown>;
	report?: () => Promise<unknown>;
};
const route = (handlers: Handlers) =>
	mockFetch.mockImplementation((url: string, init?: RequestInit) => {
		const handler = url.endsWith("/status")
			? handlers.status
			: url.endsWith("/block")
				? init?.method === "DELETE"
					? handlers.unblock
					: handlers.block
				: url.endsWith("/report")
					? handlers.report
					: init?.method === "POST"
						? handlers.send
						: handlers.poll;
		return handler ? handler() : pending();
	});
const pollCalls = () =>
	mockFetch.mock.calls.filter(([url, init]: [string, RequestInit | undefined]) => url.includes("/messages") && init?.method !== "POST");
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
			canReply: true,
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
	mockFetch.mockResolvedValue(reply(200, { status: "RESPONDED", canReply: true, messages: [] }));
	renderWithTheme(<ThreadView thread={demoThread} />);
	setVisibility("hidden");
	await tick(3600);
	expect(mockFetch).not.toHaveBeenCalled();
	setVisibility("visible");
	await tick(0);
	expect(mockFetch).toHaveBeenCalledTimes(1);
});

it("stops polling on unmount", async () => {
	mockFetch.mockResolvedValue(reply(200, { status: "RESPONDED", canReply: true, messages: [] }));
	const { unmount } = renderWithTheme(<ThreadView thread={demoThread} />);
	unmount();
	await tick(60);
	expect(mockFetch).not.toHaveBeenCalled();
});

it("goes read-only when a poll reports the thread was closed", async () => {
	mockFetch.mockResolvedValue(reply(200, { status: "CLOSED", canReply: false, messages: [] }));
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

it("refreshes the page once when a poll reports a new status", async () => {
	route({ poll: () => Promise.resolve(reply(200, { status: "CLOSED", canReply: false, messages: [] })) });
	const { rerender } = renderWithTheme(<ThreadView thread={demoThread} />);
	await tick(15);
	expect(mockRefresh).toHaveBeenCalledTimes(1);
	// Same tree, so the component re-renders rather than remounting.
	rerender(
		<ThemeProvider theme={theme}>
			<ThreadView thread={demoThread} />
		</ThemeProvider>,
	);
	await tick(60);
	expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it("refreshes the page once after a confirmed decline", async () => {
	route({ status: () => Promise.resolve(reply(200, { status: "DECLINED" })) });
	renderWithTheme(<ThreadView thread={{ ...demoThread, role: "HOST", canDecline: true }} />);
	await user().click(screen.getByRole("button", { name: "Decline" }));
	await user().click(screen.getByRole("button", { name: "Yes, decline" }));
	await tick(0);
	expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it("doesn't refresh when the polled status hasn't changed", async () => {
	route({ poll: () => Promise.resolve(reply(200, { status: "RESPONDED", canReply: true, messages: [] })) });
	renderWithTheme(<ThreadView thread={demoThread} />);
	await tick(45);
	expect(pollCalls()).toHaveLength(3);
	expect(mockRefresh).not.toHaveBeenCalled();
});

it("on 409 from a status change asks the server for the real status instead of assuming CLOSED", async () => {
	route({ status: () => Promise.resolve(reply(409, { error: "THREAD_CLOSED" })) });
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().click(screen.getByRole("button", { name: "Close conversation" }));
	await user().click(screen.getByRole("button", { name: "Yes, close it" }));
	await tick(0);
	expect(pollCalls()).toHaveLength(1);
	expect(screen.queryByText("This conversation is closed.")).not.toBeInTheDocument();
});

it("on 409 from a status change shows whatever the server says, then refreshes", async () => {
	route({
		status: () => Promise.resolve(reply(409, { error: "THREAD_CLOSED" })),
		poll: () => Promise.resolve(reply(200, { status: "DECLINED", canReply: false, messages: [] })),
	});
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().click(screen.getByRole("button", { name: "Close conversation" }));
	await user().click(screen.getByRole("button", { name: "Yes, close it" }));
	await tick(0);
	expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "Close conversation" })).not.toBeInTheDocument();
	expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it("on 409 from send polls for the real status and says it was closed only once", async () => {
	route({
		send: () => Promise.resolve(reply(409, { error: "THREAD_CLOSED" })),
		poll: () => Promise.resolve(reply(200, { status: "DECLINED", canReply: false, messages: [] })),
	});
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().type(screen.getByLabelText("Reply"), "Still on?");
	await user().click(screen.getByRole("button", { name: "Send" }));
	await tick(0);
	expect(pollCalls()).toHaveLength(1);
	expect(screen.getByRole("alert")).toHaveTextContent("This conversation was closed.");
	expect(screen.queryByText("This conversation is closed.")).not.toBeInTheDocument();
	expect(screen.getByLabelText("Reply")).toHaveValue("Still on?");
	expect(screen.getByLabelText("Reply")).toBeDisabled();
	expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it("on 401 from send asks to sign in again, stops polling and keeps the text", async () => {
	route({
		send: () => Promise.resolve(reply(401, { error: "UNAUTHENTICATED" })),
		poll: () => Promise.resolve(reply(200, { status: "RESPONDED", canReply: true, messages: [] })),
	});
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().type(screen.getByLabelText("Reply"), "Hello");
	await user().click(screen.getByRole("button", { name: "Send" }));
	await tick(0);
	expect(screen.getByRole("alert")).toHaveTextContent("Your session ended.");
	expect(screen.getByLabelText("Reply")).toHaveValue("Hello");
	await tick(60);
	expect(pollCalls()).toHaveLength(0);
});

it("never starts a poll while one is still in flight", async () => {
	route({ poll: pending });
	renderWithTheme(<ThreadView thread={demoThread} />);
	await tick(30);
	expect(mockFetch).toHaveBeenCalledTimes(1);
});

it("ignores a stale poll that resolves after a confirmed close", async () => {
	let resolvePoll: (value: unknown) => void = () => {};
	route({
		poll: () => new Promise((resolve) => (resolvePoll = resolve)),
		status: () => Promise.resolve(reply(200, { status: "CLOSED" })),
	});
	renderWithTheme(<ThreadView thread={demoThread} />);
	await tick(15);
	expect(pollCalls()).toHaveLength(1);
	await user().click(screen.getByRole("button", { name: "Close conversation" }));
	await user().click(screen.getByRole("button", { name: "Yes, close it" }));
	await tick(0);
	await act(async () => resolvePoll(reply(200, { status: "RESPONDED", canReply: true, messages: [] })));
	await tick(0);
	expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
	expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "Close conversation" })).not.toBeInTheDocument();
});

it("moves focus to the confirm button, and back to the opener on Cancel", async () => {
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().click(screen.getByRole("button", { name: "Close conversation" }));
	expect(screen.getByRole("button", { name: "Yes, close it" })).toHaveFocus();
	await user().click(screen.getByRole("button", { name: "Cancel" }));
	expect(screen.getByRole("button", { name: "Close conversation" })).toHaveFocus();
});

it("moves focus to the closed notice after a confirmed close", async () => {
	route({ status: () => Promise.resolve(reply(200, { status: "CLOSED" })) });
	renderWithTheme(<ThreadView thread={demoThread} />);
	await user().click(screen.getByRole("button", { name: "Close conversation" }));
	await user().click(screen.getByRole("button", { name: "Yes, close it" }));
	await tick(0);
	expect(screen.getByText("This conversation is closed.")).toHaveFocus();
});

const blockedThread = { ...demoThread, canReply: false, canClose: false, canDecline: false, blockedByMe: true };
const otherSideBlocked = { ...demoThread, canReply: false, canClose: false, canDecline: false, blockedByMe: false };
const openMenu = () => user().click(screen.getByRole("button", { name: "More" }));

describe("read-only from canReply", () => {
	it("a thread the other side blocked reads as closed, with no hint of a block", () => {
		renderWithTheme(<ThreadView thread={otherSideBlocked} />);
		expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
		expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Close conversation" })).not.toBeInTheDocument();
		expect(screen.queryByText(/blocked/i)).not.toBeInTheDocument();
	});

	it("a poll saying canReply false makes an open thread read-only, and polling continues", async () => {
		mockFetch.mockResolvedValue(reply(200, { status: "RESPONDED", canReply: false, messages: [] }));
		renderWithTheme(<ThreadView thread={demoThread} />);
		await tick(15);
		expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
		expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Close conversation" })).not.toBeInTheDocument();
		await tick(15);
		expect(pollCalls()).toHaveLength(2);
	});

	it("keeps polling while read-only on an open status, and brings the reply box back when canReply returns", async () => {
		mockFetch.mockResolvedValue(reply(200, { status: "RESPONDED", canReply: true, messages: [] }));
		renderWithTheme(<ThreadView thread={otherSideBlocked} />);
		expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
		expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
		await tick(15);
		expect(screen.getByLabelText("Reply")).toBeEnabled();
		expect(screen.queryByText("This conversation is closed.")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Close conversation" })).toBeInTheDocument();
	});
});

describe("blocking", () => {
	it("shows 'You blocked' with Unblock and no reply box", () => {
		renderWithTheme(<ThreadView thread={blockedThread} />);
		expect(screen.getByText("You blocked Demo Host A.")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Unblock" })).toBeInTheDocument();
		expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
		expect(screen.queryByText("This conversation is closed.")).not.toBeInTheDocument();
	});

	it("confirms in the page, blocks, then shows and focuses the blocked notice", async () => {
		route({ block: () => Promise.resolve(reply(200, { blockedByMe: true })) });
		renderWithTheme(<ThreadView thread={demoThread} />);
		await openMenu();
		await user().click(screen.getByRole("menuitem", { name: "Block Demo Host A" }));
		expect(
			screen.getByText(
				"Block Demo Host A? Neither of you will be able to send messages in your conversations, and they won't be able to send you new inquiries. They won't be told.",
			),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Yes, block Demo Host A" })).toHaveFocus();
		expect(mockFetch).not.toHaveBeenCalled();
		await user().click(screen.getByRole("button", { name: "Yes, block Demo Host A" }));
		await tick(0);
		expect(mockFetch).toHaveBeenCalledWith("/api/inquiries/inq_demo/block", expect.objectContaining({ method: "POST" }));
		expect(screen.getByText("You blocked Demo Host A.")).toHaveFocus();
		expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Close conversation" })).not.toBeInTheDocument();
	});

	it("cancelling the block sends nothing and returns focus to More", async () => {
		renderWithTheme(<ThreadView thread={demoThread} />);
		await openMenu();
		await user().click(screen.getByRole("menuitem", { name: "Block Demo Host A" }));
		await user().click(screen.getByRole("button", { name: "Cancel" }));
		expect(mockFetch).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "More" })).toHaveFocus();
		expect(screen.getByLabelText("Reply")).toBeInTheDocument();
	});

	it("on 409 NOT_LINKED explains and changes nothing", async () => {
		route({ block: () => Promise.resolve(reply(409, { error: "NOT_LINKED" })) });
		renderWithTheme(<ThreadView thread={demoThread} />);
		await openMenu();
		await user().click(screen.getByRole("menuitem", { name: "Block Demo Host A" }));
		await user().click(screen.getByRole("button", { name: "Yes, block Demo Host A" }));
		await tick(0);
		expect(screen.getByRole("alert")).toHaveTextContent("You can block this host once they've joined Iskawt.");
		expect(screen.getByLabelText("Reply")).toBeEnabled();
		expect(screen.queryByText("You blocked Demo Host A.")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "More" })).toHaveFocus();
	});

	it("ignores a stale poll that resolves after a confirmed block", async () => {
		let resolvePoll: (value: unknown) => void = () => {};
		route({
			poll: () => new Promise((resolve) => (resolvePoll = resolve)),
			block: () => Promise.resolve(reply(200, { blockedByMe: true })),
		});
		renderWithTheme(<ThreadView thread={demoThread} />);
		await tick(15);
		expect(pollCalls()).toHaveLength(1);
		await openMenu();
		await user().click(screen.getByRole("menuitem", { name: "Block Demo Host A" }));
		await user().click(screen.getByRole("button", { name: "Yes, block Demo Host A" }));
		await tick(0);
		await act(async () => resolvePoll(reply(200, { status: "RESPONDED", canReply: true, messages: [] })));
		await tick(0);
		expect(screen.getByText("You blocked Demo Host A.")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Close conversation" })).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
	});

	it("can block a closed thread", async () => {
		route({ block: () => Promise.resolve(reply(200, { blockedByMe: true })) });
		renderWithTheme(<ThreadView thread={{ ...demoThread, status: "CLOSED", canReply: false, canClose: false }} />);
		await openMenu();
		await user().click(screen.getByRole("menuitem", { name: "Block Demo Host A" }));
		await user().click(screen.getByRole("button", { name: "Yes, block Demo Host A" }));
		await tick(0);
		expect(screen.getByText("You blocked Demo Host A.")).toBeInTheDocument();
	});
});

describe("unblocking", () => {
	it("clears the notice and asks the server whether replies are allowed again", async () => {
		route({
			unblock: () => Promise.resolve(reply(200, { blockedByMe: false })),
			poll: () => Promise.resolve(reply(200, { status: "RESPONDED", canReply: true, messages: [] })),
		});
		renderWithTheme(<ThreadView thread={blockedThread} />);
		await user().click(screen.getByRole("button", { name: "Unblock" }));
		await tick(0);
		expect(mockFetch).toHaveBeenCalledWith("/api/inquiries/inq_demo/block", expect.objectContaining({ method: "DELETE" }));
		expect(pollCalls()).toHaveLength(1);
		expect(screen.queryByText("You blocked Demo Host A.")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Reply")).toBeEnabled();
		expect(screen.getByRole("button", { name: "More" })).toHaveFocus();
	});

	it("while the other side still blocks: the thread reads as closed, never a reply box", async () => {
		route({
			unblock: () => Promise.resolve(reply(200, { blockedByMe: false })),
			poll: () => Promise.resolve(reply(200, { status: "RESPONDED", canReply: false, messages: [] })),
		});
		renderWithTheme(<ThreadView thread={blockedThread} />);
		await user().click(screen.getByRole("button", { name: "Unblock" }));
		await tick(0);
		expect(screen.queryByText("You blocked Demo Host A.")).not.toBeInTheDocument();
		expect(screen.getByText("This conversation is closed.")).toBeInTheDocument();
		expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
	});

	it("doesn't lose its refresh to a poll already in flight", async () => {
		let resolveFirst: (value: unknown) => void = () => {};
		let polls = 0;
		route({
			unblock: () => Promise.resolve(reply(200, { blockedByMe: false })),
			poll: () => {
				polls += 1;
				return polls === 1
					? new Promise((resolve) => (resolveFirst = resolve))
					: Promise.resolve(reply(200, { status: "RESPONDED", canReply: true, messages: [] }));
			},
		});
		renderWithTheme(<ThreadView thread={blockedThread} />);
		await tick(15);
		expect(pollCalls()).toHaveLength(1);
		await user().click(screen.getByRole("button", { name: "Unblock" }));
		await tick(0);
		await act(async () => resolveFirst(reply(200, { status: "RESPONDED", canReply: false, messages: [] })));
		await tick(0);
		expect(pollCalls()).toHaveLength(2);
		expect(screen.getByLabelText("Reply")).toBeEnabled();
	});

	it("is offered in the More menu too", async () => {
		route({ unblock: () => Promise.resolve(reply(200, { blockedByMe: false })) });
		renderWithTheme(<ThreadView thread={blockedThread} />);
		await openMenu();
		await user().click(screen.getByRole("menuitem", { name: "Unblock Demo Host A" }));
		await tick(0);
		expect(mockFetch).toHaveBeenCalledWith("/api/inquiries/inq_demo/block", expect.objectContaining({ method: "DELETE" }));
	});
});

describe("reporting", () => {
	it("opens the dialog from the menu; Also block applies the blocked state", async () => {
		route({
			report: () => Promise.resolve(reply(201, { id: "rep_1" })),
			block: () => Promise.resolve(reply(200, { blockedByMe: true })),
		});
		renderWithTheme(<ThreadView thread={demoThread} />);
		await openMenu();
		await user().click(screen.getByRole("menuitem", { name: "Report conversation" }));
		const dialog = screen.getByRole("dialog", { name: "Report conversation" });
		await user().click(within(dialog).getByLabelText("Spam"));
		await user().click(within(dialog).getByLabelText("Also block Demo Host A"));
		await user().click(within(dialog).getByRole("button", { name: "Send report" }));
		await tick(0);
		expect(within(dialog).getByText("Thanks. Someone from Iskawt will look at this.")).toBeInTheDocument();
		await user().click(within(dialog).getByRole("button", { name: "Done" }));
		await tick(1);
		expect(screen.getByText("You blocked Demo Host A.")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "More" })).toHaveFocus();
		expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
	});
});
