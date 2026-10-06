import { screen } from "@testing-library/react";
import InquiryPanel from "@/app/_components/InquiryPanel";
import { renderWithTheme } from "@/app/_components/testing";

type FormProps = { spaceSlug: string; hostName: string; respondsInHours: number | null; today: string };
const mockFormProps: FormProps[] = [];
jest.mock("@/app/_components/InquiryForm", () => ({
	__esModule: true,
	default: (props: FormProps) => {
		mockFormProps.push(props);
		return <form aria-label="Inquiry form" />;
	},
}));

beforeEach(() => {
	mockFormProps.length = 0;
});

const base = { slug: "demo-poblacion-loft", hostName: "Demo Host A", respondsInHours: 12, today: "2026-10-07" };

it("is a labelled section", () => {
	renderWithTheme(<InquiryPanel {...base} viewer="renter" />);
	expect(screen.getByRole("region", { name: "Send an inquiry" })).toBeInTheDocument();
});

it("signed out: links to sign-in and back to this listing", () => {
	renderWithTheme(<InquiryPanel {...base} viewer="signed-out" />);
	expect(screen.getByRole("link", { name: "Sign in to send an inquiry" })).toHaveAttribute(
		"href",
		"/sign-in?next=%2Fspaces%2Fdemo-poblacion-loft",
	);
	expect(screen.queryByRole("form", { name: "Inquiry form" })).not.toBeInTheDocument();
});

it("own listing: says so and links to the inbox", () => {
	renderWithTheme(<InquiryPanel {...base} viewer="host" />);
	expect(screen.getByText("This is your listing.")).toBeInTheDocument();
	expect(screen.getByRole("link", { name: "Go to your inbox" })).toHaveAttribute("href", "/inbox");
	expect(screen.queryByRole("form", { name: "Inquiry form" })).not.toBeInTheDocument();
});

it("renter: shows the form", () => {
	renderWithTheme(<InquiryPanel {...base} viewer="renter" />);
	expect(screen.getByRole("form", { name: "Inquiry form" })).toBeInTheDocument();
});

it("renter: passes the slug, host and date through to the form", () => {
	renderWithTheme(<InquiryPanel {...base} viewer="renter" />);
	expect(mockFormProps.at(-1)).toEqual({
		spaceSlug: "demo-poblacion-loft",
		hostName: "Demo Host A",
		respondsInHours: 12,
		today: "2026-10-07",
	});
});
