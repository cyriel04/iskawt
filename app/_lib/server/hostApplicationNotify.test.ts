/** @jest-environment node */
const mockSend = jest.fn();
jest.mock("@/app/_lib/server/mailer", () => ({ getMailer: () => ({ send: (...a: unknown[]) => mockSend(...a) }) }));

import { hostApplicationEmail, notifyHostApplication } from "@/app/_lib/server/hostApplicationNotify";

const notice = { applicationId: "app_1", spaceType: "STUDIO" as const, city: "MAKATI" as const, areaName: "Poblacion", existingHost: false };
const env = { OPS_EMAIL_TO: "ops@example.invalid" } as unknown as NodeJS.ProcessEnv;

let errorSpy: jest.SpyInstance;
beforeEach(() => {
	jest.resetAllMocks();
	mockSend.mockResolvedValue(undefined);
	errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

it("builds an email with the id, type, area and city only", () => {
	expect(hostApplicationEmail({ ...notice, to: "ops@example.invalid" })).toEqual({
		to: "ops@example.invalid",
		subject: "New host application: MAKATI STUDIO",
		text: "Application app_1: STUDIO in Poblacion, MAKATI.\n\nReview in Prisma Studio.",
		html: "<p>Application app_1: STUDIO in Poblacion, MAKATI.</p><p>Review in Prisma Studio.</p>",
	});
});

it("flags an existing host", () => {
	const msg = hostApplicationEmail({ ...notice, existingHost: true, to: "ops@example.invalid" });
	expect(msg.text).toBe("Application app_1: STUDIO in Poblacion, MAKATI.\nExisting host.\n\nReview in Prisma Studio.");
	expect(msg.html).toContain("<p>Existing host.</p>");
});

it("escapes the area in HTML and keeps it on one line in the text", () => {
	const msg = hostApplicationEmail({ ...notice, areaName: "<b>Pob</b>\r\nBcc: x", to: "ops@example.invalid" });
	expect(msg.html).not.toContain("<b>");
	expect(msg.text.split("\n")[0]).toBe("Application app_1: STUDIO in <b>Pob</b> Bcc: x, MAKATI.");
});

it("sends to the ops address", async () => {
	await notifyHostApplication(notice, env);
	expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: "ops@example.invalid", subject: "New host application: MAKATI STUDIO" }));
});

it("logs the fixed line and sends nothing when no ops address is set", async () => {
	await notifyHostApplication(notice, {} as NodeJS.ProcessEnv);
	expect(errorSpy).toHaveBeenCalledWith("[host-application] no OPS_EMAIL_TO");
	expect(mockSend).not.toHaveBeenCalled();
});

it("never throws; a send failure logs the application id only", async () => {
	mockSend.mockRejectedValue(new Error("Resend responded 503 for ops@example.invalid"));
	await expect(notifyHostApplication(notice, env)).resolves.toBeUndefined();
	expect(errorSpy).toHaveBeenCalledWith("[host-application] notify failed", { applicationId: "app_1" });
	expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(/example\.invalid|Poblacion/);
});
