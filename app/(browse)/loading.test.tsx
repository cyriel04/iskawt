import { screen } from "@testing-library/react";
import { renderWithTheme } from "@/app/_components/testing";
import Loading from "./loading";

describe("Loading", () => {
	it("is a busy main landmark named Loading", () => {
		renderWithTheme(<Loading />);
		const main = screen.getByRole("main", { name: "Loading" });
		expect(main).toHaveAttribute("aria-busy", "true");
	});
});
