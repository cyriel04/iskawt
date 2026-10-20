import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mockCapture = jest.fn();
jest.mock("@sentry/nextjs", () => ({ captureException: (...a: unknown[]) => mockCapture(...a) }));

import ErrorPage from "@/app/error";
import { renderWithTheme } from "@/app/_components/testing";

describe("ErrorPage", () => {
	beforeEach(() => mockCapture.mockReset());

	it("reports the error to Sentry and does not render its message", () => {
		const error = new Error("Free on the 20th?");
		renderWithTheme(<ErrorPage error={error} retry={jest.fn()} />);

		expect(mockCapture).toHaveBeenCalledWith(error);
		expect(screen.queryByText(/Free on the 20th/)).not.toBeInTheDocument();
	});

	it("does not report a server-render error again; onRequestError already did", () => {
		const error = Object.assign(new Error("boom"), { digest: "d1" });
		renderWithTheme(<ErrorPage error={error} retry={jest.fn()} />);

		expect(mockCapture).not.toHaveBeenCalled();
	});

	it("explains the failure without exposing the error", () => {
		renderWithTheme(<ErrorPage error={new Error("select contactEmail failed")} retry={jest.fn()} />);

		expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
		expect(screen.queryByText(/contactEmail/)).not.toBeInTheDocument();
	});

	it("retries when asked", async () => {
		const retry = jest.fn();
		renderWithTheme(<ErrorPage error={new Error("boom")} retry={retry} />);

		await userEvent.click(screen.getByRole("button", { name: "Try again" }));

		expect(retry).toHaveBeenCalledTimes(1);
	});
});
