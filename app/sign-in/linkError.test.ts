import { linkErrorFrom } from "@/app/sign-in/linkError";

describe("linkErrorFrom", () => {
	it("treats any non-empty error value as a used or expired link", () => {
		expect(linkErrorFrom("INVALID_TOKEN")).toBe(true);
		expect(linkErrorFrom("<script>alert(1)</script>")).toBe(true);
		expect(linkErrorFrom(["INVALID_TOKEN", "x"])).toBe(true);
	});

	it("is false when there is no error value", () => {
		expect(linkErrorFrom(undefined)).toBe(false);
		expect(linkErrorFrom("")).toBe(false);
		expect(linkErrorFrom([])).toBe(false);
	});
});
