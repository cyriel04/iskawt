/** @jest-environment node */
const mockSpaceCount = jest.fn();
jest.mock("@/app/_lib/db", () => ({ prisma: { space: { count: (...a: unknown[]) => mockSpaceCount(...a) } } }));

import { isHostOfSpace } from "@/app/_lib/server/inquiryAccess";

beforeEach(() => jest.resetAllMocks());

it("is true when the space's host is linked to this user", async () => {
	mockSpaceCount.mockResolvedValue(1);
	await expect(isHostOfSpace("demo-poblacion-loft", "user_host")).resolves.toBe(true);
	expect(mockSpaceCount).toHaveBeenCalledWith({ where: { slug: "demo-poblacion-loft", host: { userId: "user_host" } } });
});

it("is false otherwise", async () => {
	mockSpaceCount.mockResolvedValue(0);
	await expect(isHostOfSpace("demo-poblacion-loft", "user_renter")).resolves.toBe(false);
});
