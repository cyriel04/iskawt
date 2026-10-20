import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCapture = jest.fn();
jest.mock("@sentry/nextjs", () => ({ captureException: (...a: unknown[]) => mockCapture(...a) }));

import GlobalError from "@/app/global-error";

const SECRET = "Invalid prisma.message.create() { body: 'Free on the 20th?' }";

// GlobalError renders <html>; React warns "cannot be a child of" in a
// test container. Silence only that warning; anything else still surfaces.
const realError = console.error;
beforeEach(() => {
	mockCapture.mockReset();
	jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
		if (args.map(String).join(" ").includes("cannot be a child of")) return;
		realError(...args);
	});
});
afterEach(() => jest.restoreAllMocks());

it("reports the error to Sentry and shows nothing from it", () => {
	const error = Object.assign(new Error(SECRET), { digest: "d1" });
	render(<GlobalError error={error} retry={() => {}} />, { container: document.documentElement });
	expect(mockCapture).toHaveBeenCalledWith(error);
	expect(screen.getByText("Something went wrong")).toBeInTheDocument();
	expect(document.body.textContent).not.toContain("Free on the 20th");
});

it("offers Try again", async () => {
	const retry = jest.fn();
	render(<GlobalError error={new Error("x")} retry={retry} />, { container: document.documentElement });
	await userEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(retry).toHaveBeenCalled();
});
