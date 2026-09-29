import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorPage from "@/app/error";
import { renderWithTheme } from "@/app/_components/testing";

describe("ErrorPage", () => {
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
