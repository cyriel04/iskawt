import { cityLabels, spaceTypeLabels } from "@/app/_lib/constants/labels";
import { formatPeso, headlineRate, lightSummary, locationLine } from "@/app/_components/labels";

describe("labels", () => {
	it("spells city names the way people write them", () => {
		expect(cityLabels.QUEZON_CITY).toBe("Quezon City");
		expect(cityLabels.LAS_PINAS).toBe("Las Piñas");
		expect(cityLabels.PARANAQUE).toBe("Parañaque");
		expect(cityLabels.PATEROS).toBe("Pateros");
	});

	it("labels space types for people, not databases", () => {
		expect(spaceTypeLabels.CAFE).toBe("Café");
		expect(spaceTypeLabels.EVENT_SPACE).toBe("Event space");
	});

	it("builds the public location from area and city only", () => {
		expect(locationLine("Poblacion", "MAKATI")).toBe("Poblacion, Makati");
	});
});

describe("formatPeso", () => {
	it("formats whole pesos with a peso sign and no centavos", () => {
		expect(formatPeso(1800)).toBe("₱1,800");
		expect(formatPeso(12000)).toBe("₱12,000");
	});
});

describe("headlineRate", () => {
	const none = { hourly: null, halfDay: null, fullDay: null, minimumHours: null };

	it("leads with the hourly rate", () => {
		expect(headlineRate({ ...none, hourly: 1800, halfDay: 7000 })).toEqual({
			amount: 1800,
			unit: "hour",
		});
	});

	it("falls back to half day, then full day", () => {
		expect(headlineRate({ ...none, halfDay: 7000, fullDay: 12000 })).toEqual({
			amount: 7000,
			unit: "half day",
		});
		expect(headlineRate({ ...none, fullDay: 12000 })).toEqual({ amount: 12000, unit: "full day" });
	});

	it("is null when the host gave no rate", () => {
		expect(headlineRate(none)).toBeNull();
	});
});

describe("lightSummary", () => {
	it("describes natural light, and says nothing when it is unknown", () => {
		expect(lightSummary("ABUNDANT")).toBe("Abundant light");
		expect(lightSummary("NONE")).toBe("No natural light");
		expect(lightSummary("UNKNOWN")).toBeNull();
	});
});
