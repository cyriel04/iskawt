import { render, screen } from "@testing-library/react";

const mockGetCurrentUser = jest.fn();
jest.mock("@/app/_lib/server/currentUser", () => ({
	getCurrentUser: () => mockGetCurrentUser(),
}));
jest.mock("@/app/_lib/authClient", () => ({ authClient: { signOut: jest.fn() } }));
jest.mock("next/navigation", () => ({
	...jest.requireActual("next/navigation"),
	useRouter: () => ({ refresh: jest.fn() }),
}));

import RootLayout from "@/app/layout";

beforeEach(() => mockGetCurrentUser.mockReset());

describe("RootLayout", () => {
	it("still renders the page with a Sign in link when reading the user fails", async () => {
		mockGetCurrentUser.mockRejectedValue(new Error("database unreachable"));

		const tree = await RootLayout({ children: <p>child content</p> });
		render(tree, { container: document });

		expect(screen.getByText("child content")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
	});
});
