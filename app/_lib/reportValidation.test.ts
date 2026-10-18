import { validateNewReport } from "@/app/_lib/reportValidation";

it("accepts a reason with no detail, and trims detail to null when blank", () => {
	expect(validateNewReport({ reason: "SPAM" })).toEqual({ ok: true, value: { reason: "SPAM", detail: null } });
	expect(validateNewReport({ reason: "SPAM", detail: "   " })).toEqual({ ok: true, value: { reason: "SPAM", detail: null } });
	expect(validateNewReport({ reason: "OTHER", detail: "  Asked me to pay outside the app  " })).toEqual({
		ok: true,
		value: { reason: "OTHER", detail: "Asked me to pay outside the app" },
	});
});

it("accepts exactly 1000 characters, counting code points", () => {
	expect(validateNewReport({ reason: "SPAM", detail: "🎬".repeat(1000) }).ok).toBe(true);
});

it.each([
	[{ reason: "WEDDING" }, { reason: "Choose a reason." }],
	[{}, { reason: "Choose a reason." }],
	[{ reason: "SPAM", detail: "x".repeat(1001) }, { detail: "Keep it under 1000 characters." }],
	[{ reason: "SPAM", detail: 42 }, { detail: "Enter text." }],
	[{ reason: "SPAM", detail: "a\u0000b" }, { detail: "Remove unsupported characters." }],
	[{ reason: "SPAM\u0000" }, { reason: "Choose a reason." }],
])("rejects %o", (input, errors) => {
	expect(validateNewReport(input)).toEqual({ ok: false, errors });
});

it("rejects a non-object without throwing", () => {
	expect(validateNewReport(null)).toEqual({ ok: false, errors: { reason: "Choose a reason." } });
	expect(validateNewReport("SPAM")).toEqual({ ok: false, errors: { reason: "Choose a reason." } });
});
