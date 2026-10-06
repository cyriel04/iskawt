import { screen } from "@testing-library/react";
import InboxPage from "@/app/inbox/(list)/page";
import { demoSummary, demoUser, renderWithTheme } from "@/app/_components/testing";

const mockGetCurrentUser = jest.fn();
const mockList = jest.fn();
const mockRedirect = jest.fn((url: string) => {
	throw new Error(`NEXT_REDIRECT ${url}`);
});
jest.mock("@/app/_lib/server/currentUser", () => ({ getCurrentUser: () => mockGetCurrentUser() }));
jest.mock("@/app/_lib/server/inquiries", () => ({ listInquiriesForUser: (...a: unknown[]) => mockList(...a) }));
jest.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));
jest.mock("next/link", () => ({
	__esModule: true,
	default: ({ prefetch, ...props }: { prefetch?: boolean } & Record<string, unknown>) => (
		<a data-prefetch={String(prefetch)} {...props} />
	),
}));

beforeEach(() => jest.clearAllMocks());

it("redirects to sign-in, coming back to /inbox", async () => {
	mockGetCurrentUser.mockResolvedValue(null);
	await expect(InboxPage()).rejects.toThrow("NEXT_REDIRECT /sign-in?next=%2Finbox");
	expect(mockList).not.toHaveBeenCalled();
});

it("lists the signed-in user's threads under an Inbox heading", async () => {
	mockGetCurrentUser.mockResolvedValue(demoUser);
	mockList.mockResolvedValue([demoSummary]);
	renderWithTheme(await InboxPage());
	expect(mockList).toHaveBeenCalledWith(demoUser.id);
	expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeInTheDocument();
	expect(screen.getByRole("link", { name: /Corner loft/ })).toHaveAttribute("data-prefetch", "false");
});
