import { screen } from "@testing-library/react";
import ListYourSpacePage, { metadata } from "@/app/list-your-space/page";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { demoUser, renderWithTheme } from "@/app/_components/testing";

jest.mock("@/app/_lib/server/currentUser", () => ({ getCurrentUser: jest.fn() }));
const mockGetUser = jest.mocked(getCurrentUser);
beforeEach(() => mockGetUser.mockReset());

it("has a page title", () => {
	expect(metadata.title).toBe("List your space — Iskawt");
});

it("explains the process to everyone", async () => {
	mockGetUser.mockResolvedValue(null);
	renderWithTheme(await ListYourSpacePage());
	expect(screen.getByRole("main")).toBeInTheDocument();
	expect(screen.getByRole("heading", { level: 1, name: "List your space" })).toBeInTheDocument();
	expect(screen.getByText(/Iskawt lists private spaces in Metro Manila/)).toBeInTheDocument();
	expect(screen.getByText("A person checks every space before it goes up. Rates are indicative, and Iskawt takes no payment.")).toBeInTheDocument();
	expect(screen.getByText("After you apply, we'll email you to talk it through.")).toBeInTheDocument();
});

it("asks a signed-out visitor to sign in, back to this page, and shows no form", async () => {
	mockGetUser.mockResolvedValue(null);
	renderWithTheme(await ListYourSpacePage());
	expect(screen.getByRole("link", { name: "Sign in to apply" })).toHaveAttribute("href", "/sign-in?next=%2Flist-your-space");
	expect(screen.queryByRole("button", { name: "Send application" })).not.toBeInTheDocument();
});

it("shows the form to a signed-in user", async () => {
	mockGetUser.mockResolvedValue(demoUser);
	renderWithTheme(await ListYourSpacePage());
	expect(screen.getByRole("button", { name: "Send application" })).toBeInTheDocument();
	expect(screen.queryByRole("link", { name: "Sign in to apply" })).not.toBeInTheDocument();
});
