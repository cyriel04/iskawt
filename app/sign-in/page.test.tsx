import { screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import SignInPage from "@/app/sign-in/page";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { demoUser, renderWithTheme } from "@/app/_components/testing";

jest.mock("@/app/_lib/server/currentUser", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/app/_lib/authClient", () => ({ authClient: { signIn: { magicLink: jest.fn() } } }));
jest.mock("next/navigation", () => ({
	redirect: jest.fn(() => {
		throw new Error("NEXT_REDIRECT");
	}),
}));

const mockGetUser = jest.mocked(getCurrentUser);
const params = (q: Record<string, string | string[] | undefined>) => ({ searchParams: Promise.resolve(q) });

beforeEach(() => {
	mockGetUser.mockReset();
	jest.mocked(redirect).mockClear();
});

describe("SignInPage", () => {
	it("sends a signed-in user home", async () => {
		mockGetUser.mockResolvedValue(demoUser);
		await expect(SignInPage(params({}))).rejects.toThrow("NEXT_REDIRECT");
		expect(redirect).toHaveBeenCalledWith("/");
	});

	it("shows the heading and the form when signed out", async () => {
		mockGetUser.mockResolvedValue(null);
		renderWithTheme(await SignInPage(params({})));
		expect(screen.getByRole("main")).toBeInTheDocument();
		expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
		expect(screen.getByLabelText("Email address")).toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("shows a fixed message for a link error and never echoes the query value", async () => {
		mockGetUser.mockResolvedValue(null);
		const { container } = renderWithTheme(await SignInPage(params({ error: "<b>INVALID_TOKEN</b>" })));
		expect(screen.getByRole("alert")).toHaveTextContent(
			"That link has expired or was already used. Send a new one.",
		);
		expect(container.innerHTML).not.toContain("INVALID_TOKEN");
	});
});
