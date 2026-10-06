import { screen, within } from "@testing-library/react";
import SpacePage, { generateMetadata } from "@/app/spaces/[slug]/page";
import { getPublishedSpaceBySlug } from "@/app/_lib/server/spaces";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { isHostOfSpace } from "@/app/_lib/server/inquiryAccess";
import { demoDetail, demoPhoto, demoUser, renderWithTheme } from "@/app/_components/testing";

jest.mock("@/app/_lib/server/spaces", () => ({ getPublishedSpaceBySlug: jest.fn() }));
jest.mock("@/app/_lib/server/currentUser", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/app/_lib/server/inquiryAccess", () => ({ isHostOfSpace: jest.fn() }));
type PanelProps = { viewer: string; slug: string; hostName: string; respondsInHours: number | null; today: string };
const mockPanelProps: PanelProps[] = [];
jest.mock("@/app/_components/InquiryPanel", () => ({
	__esModule: true,
	default: (props: PanelProps) => {
		mockPanelProps.push(props);
		return <div data-testid="panel" data-viewer={props.viewer} />;
	},
}));
jest.mock("next/navigation", () => ({
	notFound: jest.fn(() => {
		throw new Error("NEXT_NOT_FOUND");
	}),
}));

const mockGet = jest.mocked(getPublishedSpaceBySlug);
const mockGetUser = jest.mocked(getCurrentUser);
const mockIsHost = jest.mocked(isHostOfSpace);
const params = Promise.resolve({ slug: "demo-poblacion-loft" });

beforeEach(() => {
	mockPanelProps.length = 0;
	mockGetUser.mockReset();
	mockGetUser.mockResolvedValue(null);
	mockIsHost.mockReset();
	mockIsHost.mockResolvedValue(false);
});

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

	it("has a breadcrumb back to browse, through the city, to the current space", async () => {
		mockGet.mockResolvedValue(demoDetail);

		renderWithTheme(await SpacePage({ params }));

		const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
		expect(within(nav).getByRole("link", { name: "Spaces" })).toHaveAttribute("href", "/");
		expect(within(nav).getByRole("link", { name: "Makati" })).toHaveAttribute("href", "/?city=makati");
		const current = nav.querySelector('[aria-current="page"]');
		expect(current).not.toBeNull();
		expect(current).toHaveTextContent("[DEMO] Corner loft with afternoon light");
	});

	it("links the city crumb to browse filtered by a multi-word city", async () => {
		mockGet.mockResolvedValue({ ...demoDetail, city: "QUEZON_CITY", areaName: "Cubao" });

		renderWithTheme(await SpacePage({ params }));

		const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
		expect(within(nav).getByRole("link", { name: "Quezon City" })).toHaveAttribute("href", "/?city=quezon-city");
	});

	it("is a 404 when no published space has the slug", async () => {
		mockGet.mockResolvedValue(null);

		await expect(SpacePage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
	});
});

describe("SpacePage inquiry panel", () => {
	it("is signed-out without a session, and never asks who hosts the space", async () => {
		mockGet.mockResolvedValue(demoDetail);

		renderWithTheme(await SpacePage({ params }));

		expect(screen.getByTestId("panel")).toHaveAttribute("data-viewer", "signed-out");
		expect(mockIsHost).not.toHaveBeenCalled();
	});

	it("is the renter view for a signed-in user who isn't the host", async () => {
		mockGet.mockResolvedValue(demoDetail);
		mockGetUser.mockResolvedValue(demoUser);

		renderWithTheme(await SpacePage({ params }));

		expect(mockIsHost).toHaveBeenCalledWith("demo-poblacion-loft", "user_demo");
		expect(screen.getByTestId("panel")).toHaveAttribute("data-viewer", "renter");
	});

	it("is the host view for the space's own host", async () => {
		mockGet.mockResolvedValue(demoDetail);
		mockGetUser.mockResolvedValue(demoUser);
		mockIsHost.mockResolvedValue(true);

		renderWithTheme(await SpacePage({ params }));

		expect(screen.getByTestId("panel")).toHaveAttribute("data-viewer", "host");
	});

	it("falls back to renter when the host lookup fails, and still renders", async () => {
		mockGet.mockResolvedValue(demoDetail);
		mockGetUser.mockResolvedValue(demoUser);
		mockIsHost.mockRejectedValue(new Error("db down"));

		renderWithTheme(await SpacePage({ params }));

		expect(screen.getByTestId("panel")).toHaveAttribute("data-viewer", "renter");
		expect(
			screen.getByRole("heading", { level: 1, name: "[DEMO] Corner loft with afternoon light" }),
		).toBeInTheDocument();
	});

	it("passes the listing's slug, host and Manila date down to the panel", async () => {
		mockGet.mockResolvedValue(demoDetail);
		mockGetUser.mockResolvedValue(demoUser);

		renderWithTheme(await SpacePage({ params }));

		const props = mockPanelProps.at(-1);
		expect(props).toBeDefined();
		if (!props) return;
		expect(props.slug).toBe(demoDetail.slug);
		expect(props.hostName).toBe(demoDetail.host.displayName);
		expect(props.respondsInHours).toBe(demoDetail.host.respondsInHours);
		expect(props.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("falls back to signed-out when the session lookup fails, and still renders", async () => {
		mockGet.mockResolvedValue(demoDetail);
		mockGetUser.mockRejectedValue(new Error("db down"));

		renderWithTheme(await SpacePage({ params }));

		expect(screen.getByTestId("panel")).toHaveAttribute("data-viewer", "signed-out");
		expect(
			screen.getByRole("heading", { level: 1, name: "[DEMO] Corner loft with afternoon light" }),
		).toBeInTheDocument();
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
