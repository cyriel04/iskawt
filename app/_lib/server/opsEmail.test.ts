/** @jest-environment node */
import { opsAddress } from "@/app/_lib/server/opsEmail";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

it("prefers OPS_EMAIL_TO, falls back to REPORTS_EMAIL_TO, else null", () => {
	expect(opsAddress(env({ OPS_EMAIL_TO: "ops@example.invalid", REPORTS_EMAIL_TO: "old@example.invalid" }))).toBe("ops@example.invalid");
	expect(opsAddress(env({ REPORTS_EMAIL_TO: "old@example.invalid" }))).toBe("old@example.invalid");
	expect(opsAddress(env({}))).toBeNull();
	expect(opsAddress(env({ OPS_EMAIL_TO: "", REPORTS_EMAIL_TO: "old@example.invalid" }))).toBe("old@example.invalid");
	expect(opsAddress(env({ OPS_EMAIL_TO: "  ", REPORTS_EMAIL_TO: "old@example.invalid" }))).toBe("old@example.invalid");
	expect(opsAddress(env({ OPS_EMAIL_TO: "  " }))).toBeNull();
});
