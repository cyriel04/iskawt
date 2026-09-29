import { screen, within } from "@testing-library/react";
import SpacePage, { generateMetadata } from "@/app/spaces/[slug]/page";
import { getPublishedSpaceBySlug } from "@/app/_lib/server/spaces";
import { demoDetail, demoPhoto, renderWithTheme } from "@/app/_components/testing";

jest.mock("@/app/_lib/server/spaces", () => ({ getPublishedSpaceBySlug: jest.fn() }));
jest.mock("next/navigation", () => ({
	notFound: jest.fn(() => {
		throw new Error("NEXT_NOT_FOUND");
	}),
}));

const mockGet = jest.mocked(getPublishedSpaceBySlug);
const params = Promise.resolve({ slug: "demo-poblacion-loft" });

describe("SpacePage", () => {
	it("looks the space up by the slug in the URL", async () => {
		mockGet.mockResolvedValue(demoDetail);

		renderWithTheme(await SpacePage({ params }));

		expect(mockGet).toHaveBeenCalledWith("demo-poblacion-loft");
	});

	it("titles the page with the space and its public location", async () => {
		mockGet.mockResolvedValue(demoDetail);

		renderWithTheme(await SpacePage({ params }));

		expect(
			screen.getByRole("heading", { level: 1, name: "[DEMO] Corner loft with afternoon light" }),
		).toBeInTheDocument();
		expect(screen.getByText("Poblacion, Makati · Apartment · Indoor")).toBeInTheDocument();
	});

	it("shows area and city under Where, and says the address comes from the host", async () => {
		mockGet.mockResolvedValue(demoDetail);

		renderWithTheme(await SpacePage({ params }));

		const where = screen.getByRole("heading", { name: "Where" }).closest("section");
		expect(where).not.toBeNull();
		if (!where) return;
		expect(within(where).getByText("Poblacion, Makati")).toBeInTheDocument();
		expect(within(where).getByText(/shares the full address once they accept/)).toBeInTheDocument();
	});

	it("shows description, tags, specs and rates", async () => {
		mockGet.mockResolvedValue(demoDetail);

		renderWithTheme(await SpacePage({ params }));

		expect(screen.getByText(/Upper-floor loft in a walk-up/)).toBeInTheDocument();
		expect(screen.getByText("Large windows")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Specs" })).toBeInTheDocument();
		expect(screen.getByRole("complementary", { name: "Rates and host" })).toBeInTheDocument();
	});

	it("shows every photo when the space has them", async () => {
		const second = { url: "https://example.invalid/demo-2.jpg", alt: "Second demo photo" };
		mockGet.mockResolvedValue({ ...demoDetail, photos: [demoPhoto, second] });

		renderWithTheme(await SpacePage({ params }));

		expect(screen.getByRole("img", { name: "Demo photo placeholder" })).toBeInTheDocument();
		expect(screen.getByRole("img", { name: "Second demo photo" })).toBeInTheDocument();
	});

	it("links back to browse", async () => {
		mockGet.mockResolvedValue(demoDetail);

		renderWithTheme(await SpacePage({ params }));

		expect(screen.getByRole("link", { name: "All spaces" })).toHaveAttribute("href", "/");
	});

	it("is a 404 when no published space has the slug", async () => {
		mockGet.mockResolvedValue(null);

		await expect(SpacePage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
	});
});

describe("generateMetadata", () => {
	it("uses the space title", async () => {
		mockGet.mockResolvedValue(demoDetail);

		await expect(generateMetadata({ params })).resolves.toEqual({
			title: "[DEMO] Corner loft with afternoon light — Iskawt",
		});
	});

	it("does not reveal whether an unpublished slug exists", async () => {
		mockGet.mockResolvedValue(null);

		await expect(generateMetadata({ params })).resolves.toEqual({ title: "Space not found — Iskawt" });
	});
});
