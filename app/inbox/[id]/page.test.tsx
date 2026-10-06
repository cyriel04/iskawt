import { screen } from "@testing-library/react";
import ThreadPage from "@/app/inbox/[id]/page";
import { demoThread, demoUser, renderWithTheme } from "@/app/_components/testing";

const mockGetCurrentUser = jest.fn();
const mockGetThread = jest.fn();
jest.mock("@/app/_lib/server/currentUser", () => ({ getCurrentUser: () => mockGetCurrentUser() }));
jest.mock("@/app/_lib/server/inquiries", () => ({ getInquiryThread: (...a: unknown[]) => mockGetThread(...a) }));
jest.mock("@/app/_components/ThreadView", () => ({ __esModule: true, default: () => <div data-testid="thread-view" /> }));
jest.mock("next/navigation", () => ({
	redirect: (url: string) => {
		throw new Error(`NEXT_REDIRECT ${url}`);
	},
	notFound: () => {
		throw new Error("NEXT_NOT_FOUND");
	},
}));

const params = Promise.resolve({ id: "inq_demo" });
beforeEach(() => jest.clearAllMocks());

it("redirects to sign-in, coming back to this thread", async () => {
	mockGetCurrentUser.mockResolvedValue(null);
	await expect(ThreadPage({ params })).rejects.toThrow("NEXT_REDIRECT /sign-in?next=%2Finbox%2Finq_demo");
	expect(mockGetThread).not.toHaveBeenCalled();
});

it("404s when the thread is missing or not yours", async () => {
	mockGetCurrentUser.mockResolvedValue(demoUser);
	mockGetThread.mockResolvedValue(null);
	await expect(ThreadPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
	expect(mockGetThread).toHaveBeenCalledWith("inq_demo", demoUser.id);
});

it("renders the summary and the live view", async () => {
	mockGetCurrentUser.mockResolvedValue(demoUser);
	mockGetThread.mockResolvedValue(demoThread);
	renderWithTheme(await ThreadPage({ params }));
	expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Corner loft");
	expect(screen.getByTestId("thread-view")).toBeInTheDocument();
	expect(screen.getByRole("link", { name: "Back to inbox" })).toHaveAttribute("href", "/inbox");
});
