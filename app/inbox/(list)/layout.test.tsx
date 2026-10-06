import { render, screen } from "@testing-library/react";
import InboxListLayout from "@/app/inbox/(list)/layout";
import { demoUser } from "@/app/_components/testing";

const mockGetCurrentUser = jest.fn();
const mockRedirect = jest.fn((url: string) => {
	throw new Error(`NEXT_REDIRECT ${url}`);
});
jest.mock("@/app/_lib/server/currentUser", () => ({ getCurrentUser: () => mockGetCurrentUser() }));
jest.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));

beforeEach(() => jest.clearAllMocks());

it("redirects a signed-out visitor to sign-in, coming back to /inbox", async () => {
	mockGetCurrentUser.mockResolvedValue(null);
	await expect(InboxListLayout({ children: <p>Inbox body</p> })).rejects.toThrow("NEXT_REDIRECT /sign-in?next=%2Finbox");
});

it("renders its children for a signed-in user", async () => {
	mockGetCurrentUser.mockResolvedValue(demoUser);
	render(await InboxListLayout({ children: <p>Inbox body</p> }));
	expect(screen.getByText("Inbox body")).toBeInTheDocument();
	expect(mockRedirect).not.toHaveBeenCalled();
});
