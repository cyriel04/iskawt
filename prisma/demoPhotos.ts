// Pure helpers for the demo seed's photos, split out so they can be tested.
// seed.ts runs on import and can't be.

import fs from "node:fs";
import path from "node:path";

export type DemoPhotoRow = { url: string; alt: string; isCover: boolean; sortOrder: number };

const PHOTO_FILE = /^(\d+)\.jpe?g$/i;
const numberOf = (name: string): number => Number(PHOTO_FILE.exec(name)?.[1] ?? Number.NaN);

export function demoPhotoFiles(names: readonly string[]): string[] {
	return names.filter((name) => PHOTO_FILE.test(name)).sort((a, b) => numberOf(a) - numberOf(b));
}

export function readDemoPhotoFiles(slug: string): string[] {
	const dir = path.join(process.cwd(), "public", "demo", slug);
	if (!fs.existsSync(dir)) return [];
	return demoPhotoFiles(fs.readdirSync(dir));
}

export function buildDemoPhotos(input: {
	slug: string;
	title: string;
	typeLabel: string;
	placeholder: string;
	alts: readonly string[];
	files: readonly string[];
}): DemoPhotoRow[] {
	if (input.files.length === 0) {
		return [{ url: input.placeholder, alt: `Demo placeholder: ${input.typeLabel}`, isCover: true, sortOrder: 0 }];
	}
	const plainTitle = input.title.replace(/^\[DEMO\]\s*/, "");
	return input.files.map((file, index) => {
		const n = numberOf(file);
		return {
			url: `/demo/${input.slug}/${file}`,
			alt: input.alts[n - 1] ?? `Demo photo: ${plainTitle}, photo ${n}`,
			isCover: index === 0,
			sortOrder: index,
		};
	});
}

export function assertNoRealSpaces(realSlugs: readonly string[]): void {
	if (realSlugs.length > 0) {
		throw new Error(`Refusing to seed: these slugs belong to non-demo spaces: ${realSlugs.join(", ")}`);
	}
}
