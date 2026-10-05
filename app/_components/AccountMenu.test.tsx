import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { demoHostUser, demoUser, renderWithTheme } from "@/app/_components/testing";

const mockSignOut = jest.fn();
const mockRefresh = jest.fn();
jest.mock("@/app/_lib/authClient", () => ({ authClient: { signOut: (...a: unknown[]) => mockSignOut(...a) } }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

import AccountMenu from "@/app/_components/AccountMenu";

beforeEach(() => {
	mockSignOut.mockReset();
	mockRefresh.mockReset();
});

it("labels the button with the email when the user has no name", () => {
	renderWithTheme(<AccountMenu user={demoUser} />);
	expect(screen.getByRole("button", { name: "Account: demo-user@example.invalid" })).toBeInTheDocument();
});

it("labels the button with the name when present", () => {
	renderWithTheme(<AccountMenu user={demoHostUser} />);
	expect(screen.getByRole("button", { name: "Account: Demo Host A" })).toBeInTheDocument();
});

it("signs out from the menu and refreshes", async () => {
	mockSignOut.mockResolvedValue({ data: {}, error: null });
	renderWithTheme(<AccountMenu user={demoUser} />);
	await userEvent.click(screen.getByRole("button", { name: /account/i }));
	await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
	expect(mockSignOut).toHaveBeenCalled();
	await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
});

it("still refreshes when the sign-out request fails", async () => {
	mockSignOut.mockRejectedValue(new Error("network down"));
	renderWithTheme(<AccountMenu user={demoUser} />);
	await userEvent.click(screen.getByRole("button", { name: /account/i }));
	await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
	await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
});

it("is keyboard reachable", async () => {
	renderWithTheme(<AccountMenu user={demoUser} />);
	await userEvent.tab();
	expect(screen.getByRole("button", { name: /account/i })).toHaveFocus();
	await userEvent.keyboard("{Enter}");
	expect(await screen.findByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
});
