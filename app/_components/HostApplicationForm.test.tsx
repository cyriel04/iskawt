import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HostApplicationForm from "@/app/_components/HostApplicationForm";
import { renderWithTheme } from "@/app/_components/testing";

const mockFetch = jest.fn();
beforeEach(() => {
	mockFetch.mockReset();
	global.fetch = mockFetch;
});
const reply = (status: number, body: unknown) =>
	mockFetch.mockResolvedValue({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) });

const email = "demo-host@example.invalid";
const ADDRESS = "[UNIT NO.] [BUILDING NAME], Demo Street, Poblacion, Makati";

async function choose(label: string, option: string) {
	await userEvent.click(screen.getByRole("combobox", { name: label }));
	await userEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: option }));
}

async function fillValid() {
	await userEvent.type(screen.getByLabelText("Your name or business name"), "Demo Host");
	await choose("Space type", "Studio");
	await choose("City", "Makati");
	await userEvent.type(screen.getByLabelText("Area"), "Poblacion");
	// In user-event's type(), "[[" types a literal "[" (a single "[" starts a key descriptor).
	await userEvent.type(screen.getByLabelText("Address"), ADDRESS.replaceAll("[", "[["));
	await userEvent.type(screen.getByLabelText("About the space"), "A daylight studio with a white cyc and blackout curtains.");
	await userEvent.click(screen.getByLabelText("This space is mine to list, or I have the owner's permission."));
}
const submit = () => userEvent.click(screen.getByRole("button", { name: "Send application" }));
const posted = () => JSON.parse(mockFetch.mock.calls[0][1].body);

it("labels every field, with the privacy and rate hints", () => {
	renderWithTheme(<HostApplicationForm email={email} />);
	for (const label of ["Your name or business name", "Area", "Address", "About the space", "Hourly rate (optional)"]) {
		expect(screen.getByLabelText(label)).toBeInTheDocument();
	}
	expect(screen.getByRole("combobox", { name: "Space type" })).toBeInTheDocument();
	expect(screen.getByRole("combobox", { name: "City" })).toBeInTheDocument();
	expect(screen.getByText("Only the Iskawt team sees this. Listings show just the area and city.")).toBeInTheDocument();
	expect(screen.getByText("Indicative, in pesos per hour. Nothing is charged here.")).toBeInTheDocument();
	expect(screen.getByText("Like Poblacion or Kapitolyo.")).toBeInTheDocument();
	expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

it("hides the spam trap from people and assistive tech", () => {
	renderWithTheme(<HostApplicationForm email={email} />);
	const trap = document.getElementById("application-website");
	expect(trap).toHaveAttribute("tabindex", "-1");
	expect(trap?.closest("[aria-hidden='true']")).not.toBeNull();
});

it("offers only the Metro Manila cities", async () => {
	renderWithTheme(<HostApplicationForm email={email} />);
	await userEvent.click(screen.getByRole("combobox", { name: "City" }));
	expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(17);
});

it("validates on the client with the shared rules and doesn't post", async () => {
	renderWithTheme(<HostApplicationForm email={email} />);
	await submit();
	expect(screen.getByText("Enter your name.")).toBeInTheDocument();
	expect(screen.getByText("Choose a city.")).toBeInTheDocument();
	expect(screen.getByText("Confirm that this space is yours to list.")).toBeInTheDocument();
	expect(mockFetch).not.toHaveBeenCalled();
});

it("posts the application and thanks the user by their own email, moving focus there", async () => {
	reply(201, { received: true });
	renderWithTheme(<HostApplicationForm email={email} />);
	await fillValid();
	await submit();
	const status = await screen.findByRole("status");
	expect(status).toHaveTextContent("Thanks. We'll email you at demo-host@example.invalid after we've had a look.");
	expect(status).toHaveFocus();
	expect(mockFetch).toHaveBeenCalledWith("/api/host-applications", expect.objectContaining({ method: "POST" }));
	expect(posted()).toMatchObject({
		applicantName: "Demo Host",
		spaceType: "STUDIO",
		city: "MAKATI",
		areaName: "Poblacion",
		address: ADDRESS,
		hourlyRate: "",
		confirmsRightToList: true,
		website: "",
	});
	expect(screen.queryByText(ADDRESS)).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "Send application" })).not.toBeInTheDocument();
});

it.each([
	["1,500", "1500"],
	["₱1,500", "1500"],
	[" 1500 ", "1500"],
])("accepts a rate typed as %p and posts %p", async (typed, sent) => {
	reply(201, { received: true });
	renderWithTheme(<HostApplicationForm email={email} />);
	await fillValid();
	await userEvent.type(screen.getByLabelText("Hourly rate (optional)"), typed);
	await submit();
	await screen.findByText(/Thanks\./);
	expect(posted().hourlyRate).toBe(sent);
});

it("still rejects a fractional rate", async () => {
	renderWithTheme(<HostApplicationForm email={email} />);
	await fillValid();
	await userEvent.type(screen.getByLabelText("Hourly rate (optional)"), "12.5");
	await submit();
	expect(screen.getByText("Enter a whole number of pesos.")).toBeInTheDocument();
	expect(mockFetch).not.toHaveBeenCalled();
});

it("shows a server field error under its field and keeps the form editable", async () => {
	reply(400, { error: "VALIDATION", fields: { applicantName: "Use your own name or your business's name." } });
	renderWithTheme(<HostApplicationForm email={email} />);
	await fillValid();
	await submit();
	expect(await screen.findByText("Use your own name or your business's name.")).toBeInTheDocument();
	expect(screen.getByLabelText("Your name or business name")).toBeEnabled();
	expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

it.each([
	[429, { error: "RATE_LIMITED" }, "You've sent a lot of applications today. Try again tomorrow."],
	[500, {}, "We couldn't send that. Try again."],
])("shows the error for %i and keeps the values", async (status, body, text) => {
	reply(status, body);
	renderWithTheme(<HostApplicationForm email={email} />);
	await fillValid();
	await submit();
	expect(await screen.findByText(text)).toBeInTheDocument();
	expect(screen.getByLabelText("Address")).toHaveValue(ADDRESS);
	expect(screen.getByRole("button", { name: "Send application" })).toBeEnabled();
});

it("on 401 keeps the values and links back to sign-in for this page", async () => {
	reply(401, { error: "UNAUTHENTICATED" });
	renderWithTheme(<HostApplicationForm email={email} />);
	await fillValid();
	await submit();
	expect(await screen.findByText(/Your session ended\./)).toBeInTheDocument();
	expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/sign-in?next=%2Flist-your-space");
	expect(screen.getByLabelText("Address")).toHaveValue(ADDRESS);
});

it("on a network failure says so; the button is disabled while sending", async () => {
	let fail: (e: Error) => void = () => {};
	mockFetch.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
	renderWithTheme(<HostApplicationForm email={email} />);
	await fillValid();
	await submit();
	expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
	fail(new Error("offline"));
	expect(await screen.findByText("We couldn't send that. Try again.")).toBeInTheDocument();
});

it("links the confirmation error to the checkbox so it is announced", async () => {
	renderWithTheme(<HostApplicationForm email={email} />);
	const checkbox = screen.getByLabelText("This space is mine to list, or I have the owner's permission.");
	expect(checkbox).not.toHaveAttribute("aria-describedby");
	await submit();
	const error = screen.getByText("Confirm that this space is yours to list.");
	expect(error.id).not.toBe("");
	expect(checkbox).toHaveAttribute("aria-describedby", error.id);
});
