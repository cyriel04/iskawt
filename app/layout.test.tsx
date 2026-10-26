import { render, screen } from "@testing-library/react";

const mockGetCurrentUser = jest.fn();
jest.mock("@/app/_lib/server/currentUser", () => ({
	getCurrentUser: () => mockGetCurrentUser(),
}));
const mockHasPublicDemoSpaces = jest.fn();
jest.mock("@/app/_lib/server/spaces", () => ({
	hasPublicDemoSpaces: () => mockHasPublicDemoSpaces(),
}));
jest.mock("@/app/_lib/authClient", () => ({ authClient: { signOut: jest.fn() } }));
jest.mock("next/navigation", () => ({
	...jest.requireActual("next/navigation"),
	useRouter: () => ({ refresh: jest.fn() }),
}));

import RootLayout from "@/app/layout";

beforeEach(() => {
	mockGetCurrentUser.mockReset();
	mockHasPublicDemoSpaces.mockReset();
	mockHasPublicDemoSpaces.mockResolvedValue(false);
});

describe("RootLayout", () => {
	it("still renders the page with a Sign in link when reading the user fails", async () => {
		mockGetCurrentUser.mockRejectedValue(new Error("database unreachable"));

		const tree = await RootLayout({ children: <p>child content</p> });
		render(tree, { container: document });

		expect(screen.getByText("child content")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
	});

	it("shows the demo banner when demo spaces are public", async () => {
		mockGetCurrentUser.mockResolvedValue(null);
		mockHasPublicDemoSpaces.mockResolvedValue(true);

		render(await RootLayout({ children: <p>child content</p> }), { container: document });

		expect(screen.getByRole("note", { name: "Demo site" })).toBeInTheDocument();
	});

	it("hides the banner, and still renders, when the demo check fails", async () => {
		mockGetCurrentUser.mockResolvedValue(null);
		mockHasPublicDemoSpaces.mockRejectedValue(new Error("database unreachable"));

		render(await RootLayout({ children: <p>child content</p> }), { container: document });

		expect(screen.getByText("child content")).toBeInTheDocument();
		expect(screen.queryByRole("note", { name: "Demo site" })).not.toBeInTheDocument();
	});
});
