// Emails the other side of a thread after a message is saved. Runs from
// after(), so it never delays or fails the request. The throttle slot is
// claimed with a conditional updateMany: two messages in a row can't both
// send. Contact addresses are read here only to address the email and are
// never logged or returned.

import { NOTIFY_COOLDOWN_MINUTES } from "@/app/_lib/constants/inquiries";
import { prisma } from "@/app/_lib/db";
import { inquiryMessageEmail } from "@/app/_lib/server/inquiryEmail";
import { getMailer } from "@/app/_lib/server/mailer";
import type { InquiryRole } from "@/app/_lib/types";

const fail = (inquiryId: string) => console.error("[inquiry] notify failed", { inquiryId });

async function claim(inquiryId: string, toHost: boolean, now: Date): Promise<boolean> {
	const cutoff = new Date(now.getTime() - NOTIFY_COOLDOWN_MINUTES * 60 * 1000);
	const { count } = toHost
		? await prisma.inquiry.updateMany({
				where: { id: inquiryId, OR: [{ hostNotifiedAt: null }, { hostNotifiedAt: { lt: cutoff } }] },
				data: { hostNotifiedAt: now },
			})
		: await prisma.inquiry.updateMany({
				where: { id: inquiryId, OR: [{ renterNotifiedAt: null }, { renterNotifiedAt: { lt: cutoff } }] },
				data: { renterNotifiedAt: now },
			});
	return count === 1;
}

// Release only the slot we took, so the next message retries.
async function release(inquiryId: string, toHost: boolean, now: Date): Promise<void> {
	if (toHost) {
		await prisma.inquiry.updateMany({ where: { id: inquiryId, hostNotifiedAt: now }, data: { hostNotifiedAt: null } });
	} else {
		await prisma.inquiry.updateMany({ where: { id: inquiryId, renterNotifiedAt: now }, data: { renterNotifiedAt: null } });
	}
}

export async function notifyCounterpart(
	inquiryId: string,
	senderRole: InquiryRole,
	body: string,
	now: Date = new Date(),
): Promise<void> {
	const toHost = senderRole === "RENTER";
	try {
		const row = await prisma.inquiry.findUnique({
			where: { id: inquiryId },
			select: {
				id: true,
				requesterName: true,
				renter: { select: { email: true } },
				space: {
					select: {
						title: true,
						host: { select: { displayName: true, contactEmail: true, user: { select: { email: true } } } },
					},
				},
			},
		});
		if (!row) return;
		if (!(await claim(inquiryId, toHost, now))) return;

		const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
		const threadPath = `/inbox/${inquiryId}`;
		const host = row.space.host;
		const hostNotLinked = toHost && host.user === null;
		const message = inquiryMessageEmail({
			to: toHost ? (host.user?.email ?? host.contactEmail) : row.renter.email,
			spaceTitle: row.space.title,
			senderName: toHost ? row.requesterName : host.displayName,
			body,
			url: hostNotLinked ? `${base}/sign-in?next=${encodeURIComponent(threadPath)}` : `${base}${threadPath}`,
			hostNotLinked,
		});

		try {
			await getMailer().send(message);
		} catch {
			await release(inquiryId, toHost, now);
			fail(inquiryId);
		}
	} catch {
		fail(inquiryId);
	}
}
