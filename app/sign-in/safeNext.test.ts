import { safeNext } from "./safeNext";

it.each([
	["/spaces/demo-poblacion-loft", "/spaces/demo-poblacion-loft"],
	["/inbox/inq_1?x=1#m9", "/inbox/inq_1?x=1#m9"],
	[["/inbox", "/evil"], "/inbox"],
])("keeps the same-site path %p", (raw, expected) => {
	expect(safeNext(raw)).toBe(expected);
});

it.each([
	undefined,
	"",
	"inbox",
	"//evil.example",
	"/\\evil.example",
	"https://evil.example",
	"javascript:alert(1)",
	"%2F%2Fevil.example",
	"/%2F/evil.example",
	" /inbox",
	"/inbox\nSet-Cookie: x",
])("falls back to / for %p", (raw) => {
	expect(safeNext(raw)).toBe("/");
});
