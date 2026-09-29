import { screen } from "@testing-library/react";
import SiteFooter from "@/app/_components/SiteFooter";
import { renderWithTheme } from "@/app/_components/testing";

describe("SiteFooter", () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	it("renders a contentinfo landmark with the copyright line for the current year", () => {
		jest.useFakeTimers().setSystemTime(new Date("2031-03-01"));
		renderWithTheme(<SiteFooter />);
		const footer = screen.getByRole("contentinfo");
		expect(footer).toHaveTextContent("© 2031 Iskawt");
	});
});
