/** @jest-environment node */
import { ConsoleMailer, ResendMailer, getMailer } from "@/app/_lib/server/mailer";

const message = {
	to: "demo-user@example.invalid",
	subject: "Sign in to Iskawt",
	text: "Link: https://example.invalid/x",
	html: "<p>Link</p>",
};

describe("ResendMailer", () => {
	it("POSTs the message to Resend with the API key", async () => {
		const fetchImpl = jest.fn().mockResolvedValue(new Response("{}", { status: 200 }));
		await new ResendMailer("re_test", "Iskawt <hello@example.invalid>", fetchImpl).send(message);
		expect(fetchImpl).toHaveBeenCalledWith(
			"https://api.resend.com/emails",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({ Authorization: "Bearer re_test" }),
			}),
		);
		const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
		expect(body).toEqual({
			from: "Iskawt <hello@example.invalid>",
			to: ["demo-user@example.invalid"],
			subject: "Sign in to Iskawt",
			text: message.text,
			html: message.html,
		});
	});

	it("sends with an abort signal so a hung request cannot hang forever", async () => {
		const fetchImpl = jest.fn().mockResolvedValue(new Response("{}", { status: 200 }));
		await new ResendMailer("re_test", "from@example.invalid", fetchImpl).send(message);
		expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
	});

	it("throws on a non-2xx response, without the recipient in the error", async () => {
		const fetchImpl = jest.fn().mockResolvedValue(new Response("down", { status: 503 }));
		const send = new ResendMailer("re_test", "from@example.invalid", fetchImpl).send(message);
		await expect(send).rejects.toThrow("Resend responded 503");
		await expect(send).rejects.not.toThrow(/demo-user/);
	});
});

describe("getMailer", () => {
	it("uses Resend when RESEND_API_KEY and EMAIL_FROM are set", () => {
		const env = { NODE_ENV: "production", RESEND_API_KEY: "re_x", EMAIL_FROM: "a@example.invalid" } as NodeJS.ProcessEnv;
		expect(getMailer(env)).toBeInstanceOf(ResendMailer);
	});

	it("uses the console outside production when no key is set", () => {
		expect(getMailer({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBeInstanceOf(ConsoleMailer);
	});

	it("refuses to fall back to the console in production", () => {
		expect(() => getMailer({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(
			"RESEND_API_KEY and EMAIL_FROM are required in production",
		);
	});
});
