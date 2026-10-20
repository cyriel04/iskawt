/** @jest-environment node */
const mockFindUnique = jest.fn();
const mockSend = jest.fn();

jest.mock("@/app/_lib/db", () => ({ prisma: { report: { findUnique: (...a: unknown[]) => mockFindUnique(...a) } } }));
jest.mock("@/app/_lib/server/mailer", () => ({ getMailer: () => ({ send: (...a: unknown[]) => mockSend(...a) }) }));

import { notifyReport, reportEmail } from "@/app/_lib/server/reportNotify";

let errorSpy: jest.SpyInstance;
beforeEach(() => {
	jest.resetAllMocks();
	mockFindUnique.mockResolvedValue({ id: "rep_1", inquiryId: "inq_1", reason: "HARASSMENT" });
	mockSend.mockResolvedValue(undefined);
	errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

const env = { OPS_EMAIL_TO: "ops@example.invalid" } as unknown as NodeJS.ProcessEnv;

it("builds an email with ids and reason only", () => {
	const msg = reportEmail({ to: "ops@example.invalid", reportId: "rep_1", inquiryId: "inq_1", reason: "HARASSMENT" });
	expect(msg).toEqual({
		to: "ops@example.invalid",
		subject: "Report: HARASSMENT",
		text: "Report rep_1 on inquiry inq_1.\nReason: HARASSMENT\n\nReview in Prisma Studio.",
		html: "<p>Report rep_1 on inquiry inq_1.</p><p>Reason: HARASSMENT</p><p>Review in Prisma Studio.</p>",
	});
});

it("reads only id, inquiryId and reason, never the detail, and sends to OPS_EMAIL_TO", async () => {
	await notifyReport("rep_1", env);
	expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: "rep_1" }, select: { id: true, inquiryId: true, reason: true } });
	expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: "ops@example.invalid", subject: "Report: HARASSMENT" }));
});

it("logs the fixed line and sends nothing when OPS_EMAIL_TO is unset", async () => {
	await notifyReport("rep_1", {} as NodeJS.ProcessEnv);
	expect(errorSpy).toHaveBeenCalledWith("[report] no OPS_EMAIL_TO");
	expect(mockSend).not.toHaveBeenCalled();
});

it("never throws; a send failure logs the report id only", async () => {
	mockSend.mockRejectedValue(new Error("Resend responded 503 for ops@example.invalid"));
	await expect(notifyReport("rep_1", env)).resolves.toBeUndefined();
	expect(errorSpy).toHaveBeenCalledWith("[report] notify failed", { reportId: "rep_1" });
	expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(/example\.invalid/);
});

it("does nothing for an unknown report", async () => {
	mockFindUnique.mockResolvedValue(null);
	await notifyReport("nope", env);
	expect(mockSend).not.toHaveBeenCalled();
});

it("still sends to REPORTS_EMAIL_TO when only the old name is set", async () => {
	await notifyReport("rep_1", { REPORTS_EMAIL_TO: "old@example.invalid" } as unknown as NodeJS.ProcessEnv);
	expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: "old@example.invalid" }));
});
