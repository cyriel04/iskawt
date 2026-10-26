import { screen } from "@testing-library/react";
import PhotoFrame from "@/app/_components/PhotoFrame";
import { demoPhoto, renderWithTheme } from "@/app/_components/testing";

describe("PhotoFrame", () => {
	it("marks a demo photo with a visible badge", () => {
		renderWithTheme(<PhotoFrame photo={demoPhoto} sizes="100vw" shape="card" demo />);
		expect(screen.getByText("Demo photo · not a real space")).toBeInTheDocument();
		expect(screen.getByRole("img", { name: demoPhoto.alt })).toBeInTheDocument();
	});

	it("shows no badge on a real photo", () => {
		renderWithTheme(<PhotoFrame photo={demoPhoto} sizes="100vw" shape="card" />);
		expect(screen.queryByText("Demo photo · not a real space")).not.toBeInTheDocument();
	});

	it("shows no badge when there is no photo", () => {
		renderWithTheme(<PhotoFrame photo={null} sizes="100vw" shape="card" demo />);
		expect(screen.getByText("No photos yet")).toBeInTheDocument();
		expect(screen.queryByText("Demo photo · not a real space")).not.toBeInTheDocument();
	});
});
