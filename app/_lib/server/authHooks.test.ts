/** @jest-environment node */
const mockUserFindUnique = jest.fn();
const mockLinkHostForUser = jest.fn();
const mockRecordSignInRequest = jest.fn();
const mockSend = jest.fn();

jest.mock("@/app/_lib/db", () => ({
	prisma: { user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) } },
}));
jest.mock("@/app/_lib/server/hostLink", () => ({
	linkHostForUser: (...a: unknown[]) => mockLinkHostForUser(...a),
}));
jest.mock("@/app/_lib/server/signInLimit", () => ({
	recordSignInRequest: (...a: unknown[]) => mockRecordSignInRequest(...a),
}));
jest.mock("@/app/_lib/server/mailer", () => ({
	getMailer: () => ({ send: (...a: unknown[]) => mockSend(...a) }),
}));

import {
	magicLinkOptions,
	onSessionCreated,
	rateLimitOptions,
	sendMagicLinkEmail,
} from "@/app/_lib/server/authHooks";
import {
	MAGIC_LINK_REQUESTS_PER_HOUR,
	MAGIC_LINK_REQUESTS_PER_IP_PER_HOUR,
	MAGIC_LINK_TTL_MINUTES,
} from "@/app/_lib/constants/limits";

const email = "demo-host-a@example.invalid";
const url = "http://localhost:3000/api/auth/magic-link/verify?token=demo-token";
let errorSpy: jest.SpyInstance;

beforeEach(() => {
	jest.resetAllMocks();
	errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("onSessionCreated", () => {
	it("links the session's user to a host", async () => {
		mockUserFindUnique.mockResolvedValue({ id: "user_demo", email });
		mockLinkHostForUser.mockResolvedValue("linked");
		await onSessionCreated({ userId: "user_demo" });
		expect(mockUserFindUnique).toHaveBeenCalledWith({ where: { id: "user_demo" }, select: { id: true, email: true } });
		expect(mockLinkHostForUser).toHaveBeenCalledWith({ id: "user_demo", email });
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("does nothing when the user row is gone", async () => {
		mockUserFindUnique.mockResolvedValue(null);
		await onSessionCreated({ userId: "user_demo" });
		expect(mockLinkHostForUser).not.toHaveBeenCalled();
	});

	// I1: a linking failure must not fail sign-in (and burn the one-time link).
	it("does not fail sign-in when linking throws, and logs only the user id", async () => {
		mockUserFindUnique.mockResolvedValue({ id: "user_demo", email });
		mockLinkHostForUser.mockRejectedValue(new Error(`db error for ${email}`));
		await expect(onSessionCreated({ userId: "user_demo" })).resolves.toBeUndefined();
		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledWith("[auth] host link failed", { userId: "user_demo" });
		expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("example.invalid");
	});

	it("does not fail sign-in when the user lookup throws", async () => {
		mockUserFindUnique.mockRejectedValue(new Error("connection reset"));
		await expect(onSessionCreated({ userId: "user_demo" })).resolves.toBeUndefined();
		expect(errorSpy).toHaveBeenCalledWith("[auth] host link failed", { userId: "user_demo" });
	});
});

describe("sendMagicLinkEmail", () => {
	it("sends the magic-link email when under the per-email limit", async () => {
		mockRecordSignInRequest.mockResolvedValue(true);
		mockSend.mockResolvedValue(undefined);
		await expect(sendMagicLinkEmail({ email, url })).resolves.toBe("sent");
		expect(mockRecordSignInRequest).toHaveBeenCalledWith(email);
		expect(mockSend).toHaveBeenCalledTimes(1);
		expect(mockSend.mock.calls[0][0]).toMatchObject({ to: email });
		expect(mockSend.mock.calls[0][0].text).toContain(url);
	});

	// auth.ts maps "rate-limited" to APIError("TOO_MANY_REQUESTS"), a 429.
	// better-auth's ESM build cannot load under Jest, so that line is checked
	// by the manual round trip, not here.
	it("reports rate-limited and sends nothing over the per-email limit", async () => {
		mockRecordSignInRequest.mockResolvedValue(false);
		await expect(sendMagicLinkEmail({ email, url })).resolves.toBe("rate-limited");
		expect(mockSend).not.toHaveBeenCalled();
	});

	it("rejects when the mailer throws", async () => {
		mockRecordSignInRequest.mockResolvedValue(true);
		mockSend.mockRejectedValue(new Error("Resend responded 500"));
		await expect(sendMagicLinkEmail({ email, url })).rejects.toThrow("Resend responded 500");
	});
});

describe("Better Auth options", () => {
	// I2: Globe and Smart put many subscribers behind one CGNAT address, so the
	// IP bucket must be far wider than the per-email one.
	it("limits magic-link requests per IP at the wider per-IP cap, not the per-email cap", () => {
		expect(MAGIC_LINK_REQUESTS_PER_IP_PER_HOUR).toBe(30);
		expect(MAGIC_LINK_REQUESTS_PER_HOUR).toBe(5);
		expect(rateLimitOptions).toEqual({
			enabled: true,
			storage: "database",
			customRules: { "/sign-in/magic-link": { window: 60 * 60, max: MAGIC_LINK_REQUESTS_PER_IP_PER_HOUR } },
		});
	});

	// I3: a database read must not yield usable sign-in links.
	it("stores magic-link tokens hashed, with the configured lifetime", () => {
		expect(magicLinkOptions).toEqual({ expiresIn: MAGIC_LINK_TTL_MINUTES * 60, storeToken: "hashed" });
	});
});
