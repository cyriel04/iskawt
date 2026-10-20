/** @jest-environment node */
const mockGetCurrentUser = jest.fn();
const mockCreate = jest.fn();
const mockNotify = jest.fn();
const afterCallbacks: Array<() => unknown> = [];
jest.mock("@/app/_lib/server/currentUser", () => ({ getCurrentUser: () => mockGetCurrentUser() }));
jest.mock("@/app/_lib/server/hostApplications", () => ({ createHostApplication: (...a: unknown[]) => mockCreate(...a) }));
jest.mock("@/app/_lib/server/hostApplicationNotify", () => ({ notifyHostApplication: (...a: unknown[]) => mockNotify(...a) }));
jest.mock("next/server", () => ({ after: (cb: () => unknown) => afterCallbacks.push(cb) }));

import { POST } from "@/app/api/host-applications/route";

const user = { id: "user_1", email: "demo-host@example.invalid", name: null, host: null };
const body = {
	applicantName: "Demo Host",
	spaceType: "STUDIO",
	city: "MAKATI",
	areaName: "Poblacion",
	address: "[UNIT NO.] [BUILDING NAME], Demo Street, Poblacion, Makati",
	description: "A daylight studio with a white cyc.",
	hourlyRate: 1500,
	confirmsRightToList: true,
	website: "",
};
const req = (payload: unknown) =>
	new Request("http://localhost/api/host-applications", {
		method: "POST",
		body: typeof payload === "string" ? payload : JSON.stringify(payload),
		headers: { "content-type": "application/json" },
	});

let logSpies: jest.SpyInstance[];
beforeEach(() => {
	jest.resetAllMocks();
	afterCallbacks.length = 0;
	mockGetCurrentUser.mockResolvedValue(user);
	mockCreate.mockResolvedValue({ kind: "created", id: "app_1" });
	logSpies = [jest.spyOn(console, "log"), jest.spyOn(console, "info"), jest.spyOn(console, "error")];
});
afterEach(() => logSpies.forEach((s) => s.mockRestore()));

it("401 when signed out, and writes nothing", async () => {
	mockGetCurrentUser.mockResolvedValue(null);
	const res = await POST(req(body));
	expect(res.status).toBe(401);
	expect(await res.json()).toEqual({ error: "UNAUTHENTICATED" });
	expect(mockCreate).not.toHaveBeenCalled();
});

it("201 { received: true } only, then notifies ops with city, type, area and the host flag", async () => {
	const res = await POST(req(body));
	expect(res.status).toBe(201);
	const text = await res.text();
	expect(JSON.parse(text)).toEqual({ received: true });
	expect(text).not.toMatch(/Demo Street|demo-host|app_1/);
	expect(mockCreate).toHaveBeenCalledWith({ id: "user_1", email: "demo-host@example.invalid" }, expect.objectContaining({ city: "MAKATI", address: body.address }));
	expect(afterCallbacks).toHaveLength(1);
	await afterCallbacks[0]();
	expect(mockNotify).toHaveBeenCalledWith({ applicationId: "app_1", spaceType: "STUDIO", city: "MAKATI", areaName: "Poblacion", existingHost: false });
});

it("flags an existing linked host", async () => {
	mockGetCurrentUser.mockResolvedValue({ ...user, host: { displayName: "Demo Host A" } });
	await POST(req(body));
	await afterCallbacks[0]();
	expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ existingHost: true }));
});

it.each([
	[{ ...body, city: "CEBU" }, { city: "Choose a city." }],
	[{ ...body, confirmsRightToList: "true" }, { confirmsRightToList: "Confirm that this space is yours to list." }],
	[{ ...body, hourlyRate: "12.5" }, { hourlyRate: "Enter a whole number of pesos." }],
	[{ ...body, address: "Demo\u0000Street" }, { address: "Remove unsupported characters." }],
])("400 VALIDATION with field errors (%#)", async (payload, fields) => {
	const res = await POST(req(payload));
	expect(res.status).toBe(400);
	expect(await res.json()).toEqual({ error: "VALIDATION", fields });
	expect(mockCreate).not.toHaveBeenCalled();
});

it.each(["{not json", "null", "[1,2]"])("400 VALIDATION for a malformed body (%s)", async (raw) => {
	const res = await POST(req(raw));
	expect(res.status).toBe(400);
	expect(await res.json()).toMatchObject({ error: "VALIDATION" });
});

it("429 RATE_LIMITED, no notification", async () => {
	mockCreate.mockResolvedValue({ kind: "rate-limited" });
	const res = await POST(req(body));
	expect(res.status).toBe(429);
	expect(await res.json()).toEqual({ error: "RATE_LIMITED" });
	expect(afterCallbacks).toHaveLength(0);
});

it("spam trap: same 201, nothing saved, nothing sent", async () => {
	const res = await POST(req({ ...body, website: "http://spam.example" }));
	expect(res.status).toBe(201);
	expect(await res.json()).toEqual({ received: true });
	expect(mockCreate).not.toHaveBeenCalled();
	expect(afterCallbacks).toHaveLength(0);
});

it("logs nothing about the applicant", async () => {
	await POST(req(body));
	await afterCallbacks[0]();
	for (const spy of logSpies) expect(JSON.stringify(spy.mock.calls)).not.toMatch(/Demo Street|demo-host|Demo Host/);
});
