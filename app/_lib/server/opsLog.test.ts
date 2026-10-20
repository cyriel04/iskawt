/** @jest-environment node */
const mockCapture = jest.fn();
jest.mock("@sentry/nextjs", () => ({ captureMessage: (...a: unknown[]) => mockCapture(...a) }));

import { opsError } from "@/app/_lib/server/opsLog";

let errorSpy: jest.SpyInstance;
beforeEach(() => {
	mockCapture.mockReset();
	errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

it("logs the same line as before and captures it in Sentry with the same data", () => {
	opsError("[inquiry] notify failed", { inquiryId: "inq_1", status: 503 });
	expect(errorSpy).toHaveBeenCalledWith("[inquiry] notify failed", { inquiryId: "inq_1", status: 503 });
	expect(mockCapture).toHaveBeenCalledWith("[inquiry] notify failed", { level: "error", extra: { inquiryId: "inq_1", status: 503 } });
});

it("logs a bare line when there's no extra", () => {
	opsError("[report] no OPS_EMAIL_TO");
	expect(errorSpy).toHaveBeenCalledWith("[report] no OPS_EMAIL_TO");
	expect(mockCapture).toHaveBeenCalledWith("[report] no OPS_EMAIL_TO", { level: "error", extra: undefined });
});
