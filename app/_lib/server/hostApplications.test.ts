/** @jest-environment node */
const mockCount = jest.fn();
const mockCreate = jest.fn();
jest.mock("@/app/_lib/db", () => ({
	prisma: { hostApplication: { count: (...a: unknown[]) => mockCount(...a), create: (...a: unknown[]) => mockCreate(...a) } },
}));

import { createHostApplication } from "@/app/_lib/server/hostApplications";

const now = new Date("2026-10-20T10:00:00Z");
const dayAgo = new Date("2026-10-19T10:00:00Z");
const user = { id: "user_1", email: "demo-host@example.invalid" };
const input = {
	applicantName: "Demo Host",
	spaceType: "STUDIO" as const,
	city: "MAKATI" as const,
	areaName: "Poblacion",
	address: "[UNIT NO.] [BUILDING NAME], Demo Street, Poblacion, Makati",
	description: "A daylight studio with a white cyc.",
	hourlyRate: 1500,
	confirmsRightToList: true as const,
	website: "",
};

beforeEach(() => {
	jest.resetAllMocks();
	mockCount.mockResolvedValue(0);
	mockCreate.mockResolvedValue({ id: "app_1" });
});

it("saves a PENDING application with the session's id and email, and the address in its own column", async () => {
	await expect(createHostApplication(user, input, now)).resolves.toEqual({ kind: "created", id: "app_1" });
	expect(mockCreate).toHaveBeenCalledWith({
		data: {
			userId: "user_1",
			applicantEmail: "demo-host@example.invalid",
			applicantName: "Demo Host",
			address: "[UNIT NO.] [BUILDING NAME], Demo Street, Poblacion, Makati",
			payload: { spaceType: "STUDIO", city: "MAKATI", areaName: "Poblacion", description: "A daylight studio with a white cyc.", hourlyRate: 1500 },
		},
		select: { id: true },
	});
});

it("is rate-limited at 5 in the last 24 hours, and writes nothing", async () => {
	mockCount.mockResolvedValue(5);
	await expect(createHostApplication(user, input, now)).resolves.toEqual({ kind: "rate-limited" });
	expect(mockCount).toHaveBeenCalledWith({ where: { userId: "user_1", createdAt: { gt: dayAgo } } });
	expect(mockCreate).not.toHaveBeenCalled();
});

it("allows the 5th (4 before it)", async () => {
	mockCount.mockResolvedValue(4);
	await expect(createHostApplication(user, input, now)).resolves.toMatchObject({ kind: "created" });
});
