import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/app/_components/testing";

const mockMagicLink = jest.fn();
jest.mock("@/app/_lib/authClient", () => ({
	authClient: { signIn: { magicLink: (...a: unknown[]) => mockMagicLink(...a) } },
}));

import SignInForm from "@/app/_components/SignInForm";

const LINK_ERROR = "That link has expired or was already used. Send a new one.";

beforeEach(() => mockMagicLink.mockReset());

async function submit(email: string) {
	await userEvent.type(screen.getByLabelText("Email address"), email);
	await userEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
}

it("sends the link and shows the check-your-email state", async () => {
	mockMagicLink.mockResolvedValue({ data: { status: true }, error: null });
	renderWithTheme(<SignInForm linkError={false} />);
	await submit("demo-user@example.invalid");
	expect(mockMagicLink).toHaveBeenCalledWith({
		email: "demo-user@example.invalid",
		callbackURL: "/",
		errorCallbackURL: "/sign-in",
	});
	expect(await screen.findByRole("status")).toHaveTextContent(
		"Check your email. The link works once and expires in 15 minutes.",
	);
});

it("trims a padded email before sending it", async () => {
	mockMagicLink.mockResolvedValue({ data: { status: true }, error: null });
	renderWithTheme(<SignInForm linkError={false} />);
	await submit("  demo-user@example.invalid  ");
	expect(mockMagicLink).toHaveBeenCalledWith(expect.objectContaining({ email: "demo-user@example.invalid" }));
	await screen.findByRole("status");
});

it("disables the button while sending", async () => {
	let resolve: (v: unknown) => void = () => {};
	mockMagicLink.mockReturnValue(new Promise((r) => (resolve = r)));
	renderWithTheme(<SignInForm linkError={false} />);
	await submit("demo-user@example.invalid");
	expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
	resolve({ data: {}, error: null });
	await screen.findByRole("status");
});

it("explains the rate limit", async () => {
	mockMagicLink.mockResolvedValue({ data: null, error: { status: 429 } });
	renderWithTheme(<SignInForm linkError={false} />);
	await submit("demo-user@example.invalid");
	expect(await screen.findByRole("alert")).toHaveTextContent("Too many sign-in emails. Try again in an hour.");
});

it("says the email could not be sent when the server fails, not 'check your email'", async () => {
	mockMagicLink.mockResolvedValue({ data: null, error: { status: 500 } });
	renderWithTheme(<SignInForm linkError={false} />);
	await submit("demo-user@example.invalid");
	expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't send the email. Try again.");
	expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("says the email could not be sent when the request itself rejects", async () => {
	mockMagicLink.mockRejectedValue(new Error("network down"));
	renderWithTheme(<SignInForm linkError={false} />);
	await submit("demo-user@example.invalid");
	expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't send the email. Try again.");
	expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
});

it("rejects an invalid email without calling the server", async () => {
	renderWithTheme(<SignInForm linkError={false} />);
	await submit("not-an-email");
	expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
	expect(mockMagicLink).not.toHaveBeenCalled();
});

it("shows the used-or-expired message with the form ready", () => {
	renderWithTheme(<SignInForm linkError />);
	expect(screen.getByRole("alert")).toHaveTextContent(LINK_ERROR);
	expect(screen.getByLabelText("Email address")).toBeEnabled();
	expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
});

it("shows no alert without a link error", () => {
	renderWithTheme(<SignInForm linkError={false} />);
	expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

// A "use client" module's non-component exports can't be called from a server
// component (the sign-in page). Helpers the page needs live in app/sign-in/.
it("exports only the component", async () => {
	expect(Object.keys(await import("@/app/_components/SignInForm"))).toEqual(["default"]);
});
