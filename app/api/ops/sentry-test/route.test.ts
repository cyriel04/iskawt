/** @jest-environment node */
const mockOpsError = jest.fn();
const afterCallbacks: Array<() => unknown> = [];
jest.mock("@/app/_lib/server/opsLog", () => ({ opsError: (...a: unknown[]) => mockOpsError(...a) }));
jest.mock("next/server", () => ({ after: (cb: () => unknown) => afterCallbacks.push(cb) }));

import { GET } from "@/app/api/ops/sentry-test/route";

const KEY = "test-key-0123456789";
const req = (headers: Record<string, string> = {}, query = "") =>
	new Request(`http://localhost/api/ops/sentry-test${query}`, { headers });

beforeEach(() => {
	jest.resetAllMocks();
	afterCallbacks.length = 0;
	process.env.OPS_TEST_KEY = KEY;
});
afterAll(() => {
	delete process.env.OPS_TEST_KEY;
});

describe("GET /api/ops/sentry-test", () => {
	it("is a 404 when OPS_TEST_KEY is unset", async () => {
		delete process.env.OPS_TEST_KEY;
		const res = await GET(req({ "x-ops-key": KEY }));
		expect(res.status).toBe(404);
		expect(afterCallbacks).toHaveLength(0);
	});

	it("is a 404 without the header", async () => {
		expect((await GET(req())).status).toBe(404);
	});

	it("is a 404 with a wrong key of a different length", async () => {
		expect((await GET(req({ "x-ops-key": "x" }))).status).toBe(404);
	});

	it("is a 404 with a wrong key of the same length", async () => {
		expect((await GET(req({ "x-ops-key": "X".repeat(KEY.length) }))).status).toBe(404);
		expect(mockOpsError).not.toHaveBeenCalled();
	});

	it("schedules exactly one fixed ops message after the response", async () => {
		const res = await GET(req({ "x-ops-key": KEY }));
		expect(res.status).toBe(202);
		await expect(res.json()).resolves.toEqual({ scheduled: true });
		expect(mockOpsError).not.toHaveBeenCalled();
		expect(afterCallbacks).toHaveLength(1);
		await afterCallbacks[0]();
		expect(mockOpsError).toHaveBeenCalledTimes(1);
		expect(mockOpsError).toHaveBeenCalledWith("[ops] sentry smoke test");
	});

	it("throws a fixed error in throw mode", async () => {
		await expect(GET(req({ "x-ops-key": KEY }, "?mode=throw"))).rejects.toThrow("Sentry smoke test");
		expect(afterCallbacks).toHaveLength(0);
	});
});
