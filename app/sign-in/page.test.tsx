import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { redirect } from "next/navigation";
import SignInPage from "@/app/sign-in/page";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { demoUser, renderWithTheme } from "@/app/_components/testing";

jest.mock("@/app/_lib/server/currentUser", () => ({ getCurrentUser: jest.fn() }));
const mockMagicLink = jest.fn();
jest.mock("@/app/_lib/authClient", () => ({
	authClient: { signIn: { magicLink: (...a: unknown[]) => mockMagicLink(...a) } },
}));
jest.mock("next/navigation", () => ({
	redirect: jest.fn(() => {
		throw new Error("NEXT_REDIRECT");
	}),
}));

const mockGetUser = jest.mocked(getCurrentUser);
const params = (q: Record<string, string | string[] | undefined>) => ({ searchParams: Promise.resolve(q) });

beforeEach(() => {
	mockGetUser.mockReset();
	mockMagicLink.mockReset();
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

	it("sends a signed-in user to a same-site next path", async () => {
		mockGetUser.mockResolvedValue(demoUser);
		await expect(SignInPage(params({ next: "/spaces/x" }))).rejects.toThrow("NEXT_REDIRECT");
		expect(redirect).toHaveBeenCalledWith("/spaces/x");
	});

	it("passes next through to the magic link when signed out", async () => {
		mockGetUser.mockResolvedValue(null);
		mockMagicLink.mockResolvedValue({ data: { status: true }, error: null });
		renderWithTheme(await SignInPage(params({ next: "/spaces/demo-poblacion-loft" })));
		await userEvent.type(screen.getByLabelText("Email address"), "demo-user@example.invalid");
		await userEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
		expect(mockMagicLink).toHaveBeenCalledWith(
			expect.objectContaining({ callbackURL: "/spaces/demo-poblacion-loft" }),
		);
	});

	it.each(["//evil.example", "https://evil.example"])("drops an off-site next %p", async (next) => {
		mockGetUser.mockResolvedValue(null);
		mockMagicLink.mockResolvedValue({ data: { status: true }, error: null });
		renderWithTheme(await SignInPage(params({ next })));
		await userEvent.type(screen.getByLabelText("Email address"), "demo-user@example.invalid");
		await userEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
		expect(mockMagicLink).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: "/" }));
	});

	it("sends a signed-in user home for an off-site next", async () => {
		mockGetUser.mockResolvedValue(demoUser);
		await expect(SignInPage(params({ next: "//evil.example" }))).rejects.toThrow("NEXT_REDIRECT");
		expect(redirect).toHaveBeenCalledWith("/");
	});
});
