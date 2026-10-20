import { validateNewHostApplication } from "@/app/_lib/hostApplicationValidation";
import { City } from "@/generated/prisma/enums";

const valid = {
	applicantName: "  Demo Host  ",
	spaceType: "STUDIO",
	city: "MAKATI",
	areaName: " Poblacion ",
	address: "  [UNIT NO.] [BUILDING NAME], Demo Street, Poblacion, Makati  ",
	description: "  A daylight studio with a white cyc and blackout curtains.  ",
	hourlyRate: "1500",
	confirmsRightToList: true,
	website: "",
};

it("accepts a valid application and normalises it", () => {
	expect(validateNewHostApplication(valid)).toEqual({
		ok: true,
		value: {
			applicantName: "Demo Host",
			spaceType: "STUDIO",
			city: "MAKATI",
			areaName: "Poblacion",
			address: "[UNIT NO.] [BUILDING NAME], Demo Street, Poblacion, Makati",
			description: "A daylight studio with a white cyc and blackout curtains.",
			hourlyRate: 1500,
			confirmsRightToList: true,
			website: "",
		},
	});
});

it("accepts every Metro Manila city", () => {
	for (const city of Object.values(City)) {
		expect(validateNewHostApplication({ ...valid, city }).ok).toBe(true);
	}
});

it.each([null, undefined, ""])("treats a missing rate (%p) as null", (hourlyRate) => {
	expect(validateNewHostApplication({ ...valid, hourlyRate })).toMatchObject({ ok: true, value: { hourlyRate: null } });
});

it("accepts exactly 20 and 2000 description characters, counting code points", () => {
	expect(validateNewHostApplication({ ...valid, description: "x".repeat(20) }).ok).toBe(true);
	expect(validateNewHostApplication({ ...valid, description: "🎬".repeat(2000) }).ok).toBe(true);
});

it.each([
	["applicantName", { applicantName: "  " }, "Enter your name."],
	["applicantName", { applicantName: "x".repeat(101) }, "Keep it under 100 characters."],
	["applicantName", { applicantName: "Iskawt Support" }, "Use your own name or your business's name."],
	["applicantName", { applicantName: "Team Iskawt" }, "Use your own name or your business's name."],
	["spaceType", { spaceType: "CASTLE" }, "Choose a space type."],
	["spaceType", { spaceType: undefined }, "Choose a space type."],
	["city", { city: "CEBU" }, "Choose a city."],
	["city", { city: "makati" }, "Choose a city."],
	["areaName", { areaName: "" }, "Enter the area, like Poblacion or Kapitolyo."],
	["areaName", { areaName: "x".repeat(101) }, "Keep it under 100 characters."],
	["address", { address: " " }, "Enter the address."],
	["address", { address: "x".repeat(301) }, "Keep it under 300 characters."],
	["description", { description: "" }, "Describe the space."],
	["description", { description: "Too short" }, "Tell us a little more about the space (at least 20 characters)."],
	["description", { description: "x".repeat(2001) }, "Keep it under 2000 characters."],
	["hourlyRate", { hourlyRate: "12.5" }, "Enter a whole number of pesos."],
	["hourlyRate", { hourlyRate: 0 }, "Enter a whole number of pesos."],
	["hourlyRate", { hourlyRate: 1_000_001 }, "Enter a whole number of pesos."],
	["hourlyRate", { hourlyRate: "abc" }, "Enter a whole number of pesos."],
	["confirmsRightToList", { confirmsRightToList: false }, "Confirm that this space is yours to list."],
	["confirmsRightToList", { confirmsRightToList: "true" }, "Confirm that this space is yours to list."],
	["confirmsRightToList", { confirmsRightToList: undefined }, "Confirm that this space is yours to list."],
	["applicantName", { applicantName: "Demo\u0000Host" }, "Remove unsupported characters."],
	["areaName", { areaName: "Pob\u0000lacion" }, "Remove unsupported characters."],
	["address", { address: "Demo\u0000Street" }, "Remove unsupported characters."],
	["description", { description: "A daylight studio\u0000 with a white cyc." }, "Remove unsupported characters."],
	["applicantName", { applicantName: 42 }, "Enter your name."],
	["address", { address: ["x"] }, "Enter the address."],
])("rejects a bad %s (%o)", (field, patch, error) => {
	expect(validateNewHostApplication({ ...valid, ...patch })).toEqual({ ok: false, errors: { [field]: error } });
});

it.each([null, "text", 42, ["a"]])("rejects a non-object (%p) without throwing", (input) => {
	expect(validateNewHostApplication(input)).toMatchObject({ ok: false });
});

it("keeps the spam-trap value as given, trimmed", () => {
	expect(validateNewHostApplication({ ...valid, website: " http://x " })).toMatchObject({ ok: true, value: { website: "http://x" } });
});
