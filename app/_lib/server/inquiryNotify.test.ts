/** @jest-environment node */
const mockFindUnique = jest.fn();
const mockUpdateMany = jest.fn();
const mockSend = jest.fn();

jest.mock("@/app/_lib/db", () => ({
	prisma: {
		inquiry: {
			findUnique: (...a: unknown[]) => mockFindUnique(...a),
			updateMany: (...a: unknown[]) => mockUpdateMany(...a),
		},
	},
}));
jest.mock("@/app/_lib/server/mailer", () => ({ getMailer: () => ({ send: (...a: unknown[]) => mockSend(...a) }) }));

import { notifyCounterpart } from "@/app/_lib/server/inquiryNotify";

const now = new Date("2026-10-07T10:00:00Z");
const cutoff = new Date("2026-10-07T09:50:00Z");
const row = (hostUser: { email: string } | null = { email: "demo-host@example.invalid" }) => ({
	id: "inq_1",
	requesterName: "Demo Renter",
	hostNotifiedAt: null,
	renterNotifiedAt: null,
	renter: { email: "demo-renter@example.invalid" },
	space: {
		title: "[DEMO] Corner loft",
		host: { displayName: "Demo Host A", contactEmail: "demo-host-contact@example.invalid", user: hostUser },
	},
});

let errorSpy: jest.SpyInstance;
beforeEach(() => {
	jest.resetAllMocks();
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	mockFindUnique.mockResolvedValue(row());
	mockUpdateMany.mockResolvedValue({ count: 1 });
	mockSend.mockResolvedValue(undefined);
	errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

it("emails the linked host when the renter writes, after claiming the host's throttle slot", async () => {
	await notifyCounterpart("inq_1", "RENTER", "Free on the 20th?", now);
	expect(mockUpdateMany).toHaveBeenCalledWith({
		where: { id: "inq_1", OR: [{ hostNotifiedAt: null }, { hostNotifiedAt: { lt: cutoff } }] },
		data: { hostNotifiedAt: now },
	});
	expect(mockSend).toHaveBeenCalledWith(
		expect.objectContaining({
			to: "demo-host@example.invalid",
			subject: "New message about [DEMO] Corner loft",
			text: expect.stringContaining("Demo Renter wrote about"),
		}),
	);
	expect(mockSend.mock.calls[0][0].text).toContain("http://localhost:3000/inbox/inq_1");
});

it("emails an unlinked host at contactEmail with sign-in wording", async () => {
	mockFindUnique.mockResolvedValue(row(null));
	await notifyCounterpart("inq_1", "RENTER", "Hi", now);
	const msg = mockSend.mock.calls[0][0];
	expect(msg.to).toBe("demo-host-contact@example.invalid");
	expect(msg.text).toContain("Sign in with this email address to read and reply: http://localhost:3000/sign-in?next=%2Finbox%2Finq_1");
});

it("emails the renter when the host writes, naming the host by displayName", async () => {
	await notifyCounterpart("inq_1", "HOST", "Yes", now);
	expect(mockUpdateMany.mock.calls[0][0].data).toEqual({ renterNotifiedAt: now });
	expect(mockSend.mock.calls[0][0]).toMatchObject({ to: "demo-renter@example.invalid", text: expect.stringContaining("Demo Host A wrote about") });
});

it("sends nothing when the throttle slot is already taken (count 0)", async () => {
	mockUpdateMany.mockResolvedValue({ count: 0 });
	await notifyCounterpart("inq_1", "RENTER", "Hi", now);
	expect(mockSend).not.toHaveBeenCalled();
});

it("on send failure releases the slot and logs only the inquiry id", async () => {
	mockSend.mockRejectedValue(new Error("Resend responded 503 for demo-host@example.invalid"));
	await expect(notifyCounterpart("inq_1", "RENTER", "secret message body", now)).resolves.toBeUndefined();
	expect(mockUpdateMany).toHaveBeenLastCalledWith({
		where: { id: "inq_1", hostNotifiedAt: now },
		data: { hostNotifiedAt: null },
	});
	expect(errorSpy).toHaveBeenCalledWith("[inquiry] notify failed", { inquiryId: "inq_1" });
	expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(/example\.invalid|secret message|Demo Renter/);
});

it("never throws, even when the database read fails", async () => {
	mockFindUnique.mockRejectedValue(new Error("db down"));
	await expect(notifyCounterpart("inq_1", "RENTER", "Hi", now)).resolves.toBeUndefined();
	expect(errorSpy).toHaveBeenCalledWith("[inquiry] notify failed", { inquiryId: "inq_1" });
});

it("does nothing for an unknown inquiry", async () => {
	mockFindUnique.mockResolvedValue(null);
	await notifyCounterpart("nope", "RENTER", "Hi", now);
	expect(mockUpdateMany).not.toHaveBeenCalled();
	expect(mockSend).not.toHaveBeenCalled();
});
