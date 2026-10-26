/** @jest-environment node */
import { assertNoRealSpaces, buildDemoPhotos, demoPhotoFiles } from "./demoPhotos";

describe("demoPhotoFiles", () => {
	it("keeps numbered jpg/jpeg files, sorted by number not by text", () => {
		expect(demoPhotoFiles(["10.jpg", "2.JPEG", "1.jpg", "notes.txt", "cover.jpg", "3.png", ".DS_Store"])).toEqual([
			"1.jpg",
			"2.JPEG",
			"10.jpg",
		]);
	});
});

describe("buildDemoPhotos", () => {
	const base = {
		slug: "demo-poblacion-loft",
		title: "[DEMO] Corner loft with afternoon light",
		typeLabel: "Apartment",
		placeholder: "/demo/placeholders/apartment.svg",
		alts: ["Demo photo: one", "Demo photo: two"],
	};

	it("maps files to rows; the lowest number is the cover", () => {
		expect(buildDemoPhotos({ ...base, files: ["2.jpg", "3.jpg"] })).toEqual([
			{ url: "/demo/demo-poblacion-loft/2.jpg", alt: "Demo photo: two", isCover: true, sortOrder: 0 },
			{
				url: "/demo/demo-poblacion-loft/3.jpg",
				alt: "Demo photo: Corner loft with afternoon light, photo 3",
				isCover: false,
				sortOrder: 1,
			},
		]);
	});

	it("takes the alt by the file's number, not its position", () => {
		const rows = buildDemoPhotos({ ...base, files: ["1.jpg"] });
		expect(rows[0].alt).toBe("Demo photo: one");
	});

	it("falls back to the type placeholder when there are no files", () => {
		expect(buildDemoPhotos({ ...base, files: [] })).toEqual([
			{ url: "/demo/placeholders/apartment.svg", alt: "Demo placeholder: Apartment", isCover: true, sortOrder: 0 },
		]);
	});
});

describe("assertNoRealSpaces", () => {
	it("passes when no seeded slug belongs to a real space", () => {
		expect(() => assertNoRealSpaces([])).not.toThrow();
	});

	it("refuses to overwrite a real space", () => {
		expect(() => assertNoRealSpaces(["demo-poblacion-loft"])).toThrow(
			"Refusing to seed: these slugs belong to non-demo spaces: demo-poblacion-loft",
		);
	});
});
