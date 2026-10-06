import { manilaToday, validateMessageBody, validateNewInquiry } from "@/app/_lib/inquiryValidation";

const today = "2026-10-06";
const valid = {
	spaceSlug: "demo-poblacion-loft",
	requesterName: "  Demo Renter  ",
	requesterCompany: "",
	shootDate: "2026-10-20",
	durationHours: 6,
	crewSize: "12",
	productionType: "COMMERCIAL",
	budgetNote: null,
	message: "  Is the loft free on the 20th?  ",
	website: "",
};

describe("manilaToday", () => {
	it("uses Manila's calendar date, not UTC's", () => {
		// 2026-10-05T16:30Z is 00:30 on the 6th in Manila (UTC+8).
		expect(manilaToday(new Date("2026-10-05T16:30:00Z"))).toBe("2026-10-06");
	});
});

describe("validateNewInquiry", () => {
	it("accepts a valid input and normalizes it", () => {
		expect(validateNewInquiry(valid, today)).toEqual({
			ok: true,
			value: {
				spaceSlug: "demo-poblacion-loft",
				requesterName: "Demo Renter",
				requesterCompany: null,
				shootDate: "2026-10-20",
				durationHours: 6,
				crewSize: 12,
				productionType: "COMMERCIAL",
				budgetNote: null,
				message: "Is the loft free on the 20th?",
				website: "",
			},
		});
	});

	it("treats missing optional fields as null", () => {
		const result = validateNewInquiry(
			{ spaceSlug: "s", requesterName: "A", productionType: "FILM", message: "Hi", website: "" },
			today,
		);
		expect(result).toMatchObject({ ok: true, value: { shootDate: null, durationHours: null, crewSize: null } });
	});

	it.each([
		["requesterName", { requesterName: "   " }, "Enter your name."],
		["requesterName", { requesterName: "x".repeat(101) }, "Keep it under 100 characters."],
		["requesterCompany", { requesterCompany: "x".repeat(101) }, "Keep it under 100 characters."],
		["shootDate", { shootDate: "2026-02-30" }, "Enter a valid date."],
		["shootDate", { shootDate: "2026-10-05" }, "Pick today or a later date."],
		["shootDate", { shootDate: "2027-10-07" }, "Pick a date within the next year."],
		["durationHours", { durationHours: 0 }, "Enter whole hours from 1 to 24."],
		["durationHours", { durationHours: 2.5 }, "Enter whole hours from 1 to 24."],
		["crewSize", { crewSize: 1000 }, "Enter a crew size from 1 to 999."],
		["productionType", { productionType: "WEDDING" }, "Choose a production type."],
		["budgetNote", { budgetNote: "x".repeat(501) }, "Keep it under 500 characters."],
		["message", { message: "  " }, "Write a message."],
		["message", { message: "x".repeat(4001) }, "Keep it under 4000 characters."],
		["spaceSlug", { spaceSlug: "" }, "Missing space."],
	])("rejects a bad %s", (field, patch, error) => {
		const result = validateNewInquiry({ ...valid, ...patch }, today);
		expect(result).toEqual({ ok: false, errors: { [field]: error } });
	});

	it("accepts today and exactly one year ahead", () => {
		expect(validateNewInquiry({ ...valid, shootDate: "2026-10-06" }, today).ok).toBe(true);
		expect(validateNewInquiry({ ...valid, shootDate: "2027-10-06" }, today).ok).toBe(true);
	});

	it("counts characters, not UTF-16 units, for caps", () => {
		expect(validateNewInquiry({ ...valid, requesterName: "🎬".repeat(100) }, today).ok).toBe(true);
	});

	it("rejects a non-object body without throwing", () => {
		expect(validateNewInquiry(null, today)).toMatchObject({ ok: false });
		expect(validateNewInquiry("text", today)).toMatchObject({ ok: false });
	});

	it("keeps the spam-trap value as given, trimmed", () => {
		expect(validateNewInquiry({ ...valid, website: " http://x " }, today)).toMatchObject({
			ok: true,
			value: { website: "http://x" },
		});
	});
});

describe("validateMessageBody", () => {
	it("trims and accepts", () => {
		expect(validateMessageBody("  hello ")).toEqual({ ok: true, value: "hello" });
	});
	it("rejects empty, too long and non-strings", () => {
		expect(validateMessageBody(" ")).toEqual({ ok: false, error: "Write a message." });
		expect(validateMessageBody("x".repeat(4001))).toEqual({ ok: false, error: "Keep it under 4000 characters." });
		expect(validateMessageBody(42)).toEqual({ ok: false, error: "Write a message." });
	});
});
