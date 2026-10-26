import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListingGallery from "@/app/_components/ListingGallery";
import { renderWithTheme } from "@/app/_components/testing";
import type { PublicPhoto } from "@/app/_lib/types";

const photo = (n: number): PublicPhoto => ({ url: `https://example.invalid/p${n}.jpg`, alt: `Photo alt ${n}` });
const photos = [1, 2, 3].map(photo);

function order() {
	const big = screen.getByTestId("gallery-big");
	const bigAlt = within(big).getByRole("img").getAttribute("alt");
	const small = screen.queryAllByRole("button", { name: /^Show photo/ }).map((b) => within(b).getByRole("img").getAttribute("alt"));
	return [bigAlt, ...small];
}

describe("ListingGallery", () => {
	it("shows the first photo big and the next two beside it", () => {
		renderWithTheme(<ListingGallery photos={photos} demo={false} />);
		expect(order()).toEqual(["Photo alt 1", "Photo alt 2", "Photo alt 3"]);
		expect(screen.getByText("Photo 1 of 3")).toBeInTheDocument();
	});

	it("rotates on Next and wraps", async () => {
		const user = userEvent.setup();
		renderWithTheme(<ListingGallery photos={photos} demo={false} />);
		await user.click(screen.getByRole("button", { name: "Next photo" }));
		expect(order()).toEqual(["Photo alt 2", "Photo alt 3", "Photo alt 1"]);
		expect(screen.getByText("Photo 2 of 3")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Next photo" }));
		await user.click(screen.getByRole("button", { name: "Next photo" }));
		expect(order()).toEqual(["Photo alt 1", "Photo alt 2", "Photo alt 3"]);
	});

	it("goes back on Previous and wraps from the first", async () => {
		const user = userEvent.setup();
		renderWithTheme(<ListingGallery photos={photos} demo={false} />);
		await user.click(screen.getByRole("button", { name: "Previous photo" }));
		expect(order()).toEqual(["Photo alt 3", "Photo alt 1", "Photo alt 2"]);
		expect(screen.getByText("Photo 3 of 3")).toBeInTheDocument();
	});

	it("makes a clicked small photo the big one", async () => {
		const user = userEvent.setup();
		renderWithTheme(<ListingGallery photos={photos} demo={false} />);
		await user.click(screen.getByRole("button", { name: "Show photo 3" }));
		expect(order()[0]).toBe("Photo alt 3");
		expect(screen.getByText("Photo 3 of 3")).toBeInTheDocument();
	});

	it("announces the position politely", () => {
		renderWithTheme(<ListingGallery photos={photos} demo={false} />);
		expect(screen.getByText("Photo 1 of 3")).toHaveAttribute("aria-live", "polite");
	});

	it("shows one photo with no buttons", () => {
		renderWithTheme(<ListingGallery photos={[photo(1)]} demo={false} />);
		expect(screen.getAllByRole("img")).toHaveLength(1);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("shows one small slot for two photos", async () => {
		const user = userEvent.setup();
		renderWithTheme(<ListingGallery photos={[photo(1), photo(2)]} demo={false} />);
		expect(order()).toEqual(["Photo alt 1", "Photo alt 2"]);
		await user.click(screen.getByRole("button", { name: "Next photo" }));
		expect(order()).toEqual(["Photo alt 2", "Photo alt 1"]);
	});

	it("cycles through every photo when there are more than three", async () => {
		const user = userEvent.setup();
		renderWithTheme(<ListingGallery photos={[1, 2, 3, 4, 5].map(photo)} demo={false} />);
		expect(order()).toEqual(["Photo alt 1", "Photo alt 2", "Photo alt 3"]);
		await user.click(screen.getByRole("button", { name: "Next photo" }));
		await user.click(screen.getByRole("button", { name: "Next photo" }));
		await user.click(screen.getByRole("button", { name: "Next photo" }));
		expect(order()).toEqual(["Photo alt 4", "Photo alt 5", "Photo alt 1"]);
		expect(screen.getByText("Photo 4 of 5")).toBeInTheDocument();
	});

	it("puts a single badge on the big photo of a demo listing", async () => {
		const user = userEvent.setup();
		renderWithTheme(<ListingGallery photos={photos} demo />);
		expect(screen.getAllByText("Demo photos · not a real space")).toHaveLength(1);
		expect(within(screen.getByTestId("gallery-big")).getByText("Demo photos · not a real space")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Next photo" }));
		expect(screen.getAllByText("Demo photos · not a real space")).toHaveLength(1);
	});

	it("has no badge on a real listing", () => {
		renderWithTheme(<ListingGallery photos={photos} demo={false} />);
		expect(screen.queryByText(/not a real space/)).not.toBeInTheDocument();
	});

	it("falls back to the empty frame with no photos", () => {
		renderWithTheme(<ListingGallery photos={[]} demo={false} />);
		expect(screen.getByText("No photos yet")).toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});
});
