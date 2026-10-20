// Host applications. A human reviews each one in Prisma Studio and creates the
// Host and Space rows by hand: nothing here ever creates either. The address
// and the applicant's email are private to ops, never returned or logged.

import { HOST_APPLICATIONS_PER_USER_PER_DAY } from "@/app/_lib/constants/hostApplications";
import { prisma } from "@/app/_lib/db";
import type { NewHostApplicationInput } from "@/app/_lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type HostApplicationResult = { kind: "created"; id: string } | { kind: "rate-limited" };

export async function createHostApplication(
	user: { id: string; email: string },
	input: NewHostApplicationInput,
	now: Date = new Date(),
): Promise<HostApplicationResult> {
	const recent = await prisma.hostApplication.count({
		where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
	});
	if (recent >= HOST_APPLICATIONS_PER_USER_PER_DAY) return { kind: "rate-limited" };
	const created = await prisma.hostApplication.create({
		data: {
			userId: user.id,
			applicantEmail: user.email,
			applicantName: input.applicantName,
			address: input.address,
			payload: {
				spaceType: input.spaceType,
				city: input.city,
				areaName: input.areaName,
				description: input.description,
				hourlyRate: input.hourlyRate,
			},
		},
		select: { id: true },
	});
	return { kind: "created", id: created.id };
}
