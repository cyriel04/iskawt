import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/app/_components/testing";
import ScrollToTop from "@/app/_components/ScrollToTop";

const originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
const originalScrollTo = window.scrollTo;
const originalMatchMedia = window.matchMedia;

function scrollTo(y: number) {
	Object.defineProperty(window, "scrollY", { value: y, configurable: true });
	act(() => {
		window.dispatchEvent(new Event("scroll"));
	});
}

function mockReducedMotion(matches: boolean) {
	Object.defineProperty(window, "matchMedia", {
		value: jest.fn().mockReturnValue({
			matches,
			addListener: jest.fn(),
			removeListener: jest.fn(),
			addEventListener: jest.fn(),
			removeEventListener: jest.fn(),
		}),
		configurable: true,
		writable: true,
	});
}

beforeEach(() => {
	Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
	window.scrollTo = jest.fn();
	mockReducedMotion(false);
});

afterEach(() => {
	jest.restoreAllMocks();
	if (originalScrollY) Object.defineProperty(window, "scrollY", originalScrollY);
	else Reflect.deleteProperty(window, "scrollY");
	window.scrollTo = originalScrollTo;
	Object.defineProperty(window, "matchMedia", {
		value: originalMatchMedia,
		configurable: true,
		writable: true,
	});
});

describe("ScrollToTop", () => {
	it("renders nothing at the top of the page", () => {
		renderWithTheme(<ScrollToTop />);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("appears after scrolling past half a viewport height", () => {
		renderWithTheme(<ScrollToTop />);
		scrollTo(window.innerHeight / 2 + 1);
		expect(screen.getByRole("button", { name: "Back to top" })).toBeInTheDocument();
	});

	it("is visible at three quarters of a viewport height", () => {
		renderWithTheme(<ScrollToTop />);
		scrollTo(window.innerHeight * 0.75);
		expect(screen.getByRole("button", { name: "Back to top" })).toBeInTheDocument();
	});

	it("shows straight away when mounted mid-page", () => {
		Object.defineProperty(window, "scrollY", { value: window.innerHeight / 2 + 50, configurable: true });
		renderWithTheme(<ScrollToTop />);
		expect(screen.getByRole("button", { name: "Back to top" })).toBeInTheDocument();
	});

	it("hides again at or below half a viewport height", () => {
		renderWithTheme(<ScrollToTop />);
		scrollTo(window.innerHeight / 2 + 1);
		scrollTo(window.innerHeight / 2);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("scrolls smoothly to the top on click", async () => {
		renderWithTheme(<ScrollToTop />);
		scrollTo(window.innerHeight / 2 + 1);
		await userEvent.click(screen.getByRole("button", { name: "Back to top" }));
		expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
	});

	it("does not animate when the user prefers reduced motion", async () => {
		mockReducedMotion(true);
		renderWithTheme(<ScrollToTop />);
		scrollTo(window.innerHeight / 2 + 1);
		await userEvent.click(screen.getByRole("button", { name: "Back to top" }));
		expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
	});

	it("treats a missing matchMedia as no preference", async () => {
		Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true, writable: true });
		renderWithTheme(<ScrollToTop />);
		scrollTo(window.innerHeight / 2 + 1);
		await userEvent.click(screen.getByRole("button", { name: "Back to top" }));
		expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
	});

	it("removes its passive scroll listener on unmount", () => {
		const add = jest.spyOn(window, "addEventListener");
		const remove = jest.spyOn(window, "removeEventListener");
		const { unmount } = renderWithTheme(<ScrollToTop />);
		expect(add).toHaveBeenCalledWith("scroll", expect.any(Function), { passive: true });
		const handler = add.mock.calls.find(([type]) => type === "scroll")?.[1];
		unmount();
		expect(remove).toHaveBeenCalledWith("scroll", handler);
	});
});
