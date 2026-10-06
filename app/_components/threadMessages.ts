// Pure helpers for the live thread view. No React, no fetch: unit-tested on
// their own and shared by ThreadView and the inbox list.

import type { InquiryMessage, InquiryStatus } from "@/app/_lib/types";

const byTimeThenId = (a: InquiryMessage, b: InquiryMessage) =>
	a.sentAt === b.sentAt ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.sentAt < b.sentAt ? -1 : 1;

// Messages can commit out of sentAt order, so the poller re-reads a short
// overlap. This keeps the first copy of each id and restores the order.
export function mergeMessages(existing: InquiryMessage[], incoming: InquiryMessage[]): InquiryMessage[] {
	const seen = new Set(existing.map((x) => x.id));
	const fresh = incoming.filter((x) => !seen.has(x.id));
	if (fresh.length === 0) return existing;
	return [...existing, ...fresh].sort(byTimeThenId);
}

// The id to pass as ?after=: the newest message at least `overlapSeconds`
// older than the newest one. Null means "send everything".
export function pollCursor(messages: InquiryMessage[], overlapSeconds = 5): string | null {
	const newest = messages.at(-1);
	if (!newest) return null;
	const limit = Date.parse(newest.sentAt) - overlapSeconds * 1000;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (Date.parse(messages[i].sentAt) <= limit) return messages[i].id;
	}
	return null;
}

const formatter = new Intl.DateTimeFormat("en-PH", {
	timeZone: "Asia/Manila",
	day: "numeric",
	month: "short",
	hour: "numeric",
	minute: "2-digit",
	hour12: true,
});

// Fixed zone, locale and part order, so the server render and the client
// agree. Built from parts because en-PH's own order ("Oct 7, 6:00 PM") varies
// by ICU version; we always want "7 Oct, 6:00 PM".
export function formatSentAt(iso: string): string {
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		formatter.formatToParts(new Date(iso)).find((p) => p.type === type)?.value ?? "";
	return `${part("day")} ${part("month")}, ${part("hour")}:${part("minute")} ${part("dayPeriod").toUpperCase()}`;
}

export function isOpenStatus(status: InquiryStatus): boolean {
	return status === "NEW" || status === "RESPONDED";
}
