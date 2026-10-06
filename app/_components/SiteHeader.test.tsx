import { screen } from "@testing-library/react";
import SiteHeader from "@/app/_components/SiteHeader";
import { demoHostUser, demoUser, renderWithTheme } from "@/app/_components/testing";

jest.mock("@/app/_lib/authClient", () => ({ authClient: { signOut: jest.fn() } }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));

describe("SiteHeader", () => {
	it("renders a banner landmark with the wordmark linking home, not as a heading", () => {
		renderWithTheme(<SiteHeader user={null} />);
		expect(screen.getByRole("banner")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Iskawt" })).toHaveAttribute("href", "/");
		expect(screen.queryByRole("heading")).not.toBeInTheDocument();
	});

	it("shows a Sign in link when signed out", () => {
		renderWithTheme(<SiteHeader user={null} />);
		expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("shows the account menu button when signed in, without a Host chip for a non-host", () => {
		renderWithTheme(<SiteHeader user={demoUser} />);
		expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: /account/i })).toBeInTheDocument();
		expect(screen.queryByText("Host")).not.toBeInTheDocument();
	});

	it("links to the inbox when signed in", () => {
		renderWithTheme(<SiteHeader user={demoUser} />);
		expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("href", "/inbox");
	});

	it("has no inbox link when signed out", () => {
		renderWithTheme(<SiteHeader user={null} />);
		expect(screen.queryByRole("link", { name: "Inbox" })).not.toBeInTheDocument();
	});

	it("shows the Host chip for a linked host", () => {
		renderWithTheme(<SiteHeader user={demoHostUser} />);
		expect(screen.getByText("Host")).toBeInTheDocument();
	});
});
