import { screen } from "@testing-library/react";
import { renderWithTheme } from "@/app/_components/testing";
import Loading from "./loading";

describe("Inbox loading", () => {
	it("is a busy main landmark named Loading, sketching the heading and rows", () => {
		renderWithTheme(<Loading />);
		const main = screen.getByRole("main", { name: "Loading" });
		expect(main).toHaveAttribute("aria-busy", "true");
		expect(main.querySelectorAll(".MuiSkeleton-root").length).toBeGreaterThan(1);
	});

	it("offers nothing that looks usable while loading", () => {
		renderWithTheme(<Loading />);
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
		expect(screen.queryByRole("list")).not.toBeInTheDocument();
	});
});
