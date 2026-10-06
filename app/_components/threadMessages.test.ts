import { formatSentAt, isOpenStatus, mergeMessages, pollCursor } from "@/app/_components/threadMessages";
import { inquiryStatusLabels } from "@/app/_lib/constants/labels";
import type { InquiryMessage } from "@/app/_lib/types";

const m = (id: string, sentAt: string, body = id): InquiryMessage => ({
	id,
	body,
	sentAt,
	fromMe: false,
	senderName: "Demo Host A",
});

describe("mergeMessages", () => {
	it("appends new messages, dedupes by id, and orders by sentAt then id", () => {
		const existing = [m("a", "2026-10-07T10:00:00.000Z"), m("c", "2026-10-07T10:00:05.000Z")];
		const incoming = [m("c", "2026-10-07T10:00:05.000Z", "c again"), m("b", "2026-10-07T10:00:03.000Z"), m("d", "2026-10-07T10:00:05.000Z")];
		expect(mergeMessages(existing, incoming).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
	});

	it("keeps the existing copy of a duplicate", () => {
		const merged = mergeMessages([m("a", "2026-10-07T10:00:00.000Z", "first")], [m("a", "2026-10-07T10:00:00.000Z", "second")]);
		expect(merged).toHaveLength(1);
		expect(merged[0].body).toBe("first");
	});

	it("returns the same array when nothing is new (no re-render churn)", () => {
		const existing = [m("a", "2026-10-07T10:00:00.000Z")];
		expect(mergeMessages(existing, [m("a", "2026-10-07T10:00:00.000Z")])).toBe(existing);
	});
});

describe("pollCursor", () => {
	it("is null for an empty thread", () => {
		expect(pollCursor([])).toBeNull();
	});

	it("is the newest message at least 5 s older than the newest one", () => {
		const msgs = [
			m("a", "2026-10-07T10:00:00.000Z"),
			m("b", "2026-10-07T10:00:04.000Z"),
			m("c", "2026-10-07T10:00:06.000Z"),
			m("d", "2026-10-07T10:00:10.000Z"),
		];
		expect(pollCursor(msgs)).toBe("b"); // 10.000 − 5 s = 05.000 → newest at or before is b (04.000)
	});

	it("is null when every message is within the overlap window (fetch them all again)", () => {
		expect(pollCursor([m("a", "2026-10-07T10:00:08.000Z"), m("b", "2026-10-07T10:00:10.000Z")])).toBeNull();
	});
});

describe("formatSentAt", () => {
	it("formats in Manila time regardless of the machine's zone", () => {
		expect(formatSentAt("2026-10-07T10:00:00.000Z")).toBe("7 Oct, 6:00 PM");
		expect(formatSentAt("2026-10-07T16:30:00.000Z")).toBe("8 Oct, 12:30 AM");
	});
});

describe("status", () => {
	it("knows which statuses are open", () => {
		expect(isOpenStatus("NEW")).toBe(true);
		expect(isOpenStatus("RESPONDED")).toBe(true);
		expect(isOpenStatus("DECLINED")).toBe(false);
		expect(isOpenStatus("CLOSED")).toBe(false);
	});

	it("labels every status", () => {
		expect(inquiryStatusLabels).toEqual({ NEW: "New", RESPONDED: "Replied", DECLINED: "Declined", CLOSED: "Closed" });
	});
});
