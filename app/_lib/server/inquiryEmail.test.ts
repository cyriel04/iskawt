/** @jest-environment node */
import { inquiryMessageEmail } from "@/app/_lib/server/inquiryEmail";

const base = {
	to: "demo-host@example.invalid",
	spaceTitle: "[DEMO] Corner loft",
	url: "http://localhost:3000/inbox/inq_1",
	hostNotLinked: false,
};

it("addresses the recipient and names the space in the subject", () => {
	const msg = inquiryMessageEmail(base);
	expect(msg.to).toBe("demo-host@example.invalid");
	expect(msg.subject).toBe("New message about [DEMO] Corner loft");
});

it("says there is a message and links to it, with the safety line and no-reply footer", () => {
	const msg = inquiryMessageEmail(base);
	expect(msg.text).toContain("You have a new message about [DEMO] Corner loft.");
	expect(msg.text).toContain("Reply on Iskawt: http://localhost:3000/inbox/inq_1");
	expect(msg.text).toContain("Iskawt never asks for passwords or payment, by email or in messages.");
	expect(msg.text).toContain("Replies to this email aren't delivered.");
	expect(msg.html).toContain('href="http://localhost:3000/inbox/inq_1"');
	expect(msg.html).toContain("Iskawt never asks for passwords or payment, by email or in messages.");
});

it("tells an unlinked host to sign in with this address", () => {
	const msg = inquiryMessageEmail({ ...base, hostNotLinked: true, url: "http://localhost:3000/sign-in?next=%2Finbox%2Finq_1" });
	expect(msg.text).toContain("Sign in with this email address to read and reply: http://localhost:3000/sign-in?next=%2Finbox%2Finq_1");
});

it("takes no sender name or message body, so neither can reach the email", () => {
	// The args type has no such fields; extra properties prove they are ignored.
	const withExtras: Parameters<typeof inquiryMessageEmail>[0] & Record<string, unknown> = {
		...base,
		senderName: "Iskawt Support",
		body: "Your listing is suspended. Verify at https://evil.example",
	};
	for (const variant of [withExtras, { ...withExtras, hostNotLinked: true }]) {
		const msg = inquiryMessageEmail(variant);
		const all = `${msg.subject}\n${msg.text}\n${msg.html}`;
		expect(all).not.toContain("Iskawt Support");
		expect(all).not.toContain("suspended");
		expect(all).not.toContain("evil.example");
		expect(all).not.toContain("wrote about");
	}
});

it("escapes HTML in the space title and strips CR/LF from the subject", () => {
	const msg = inquiryMessageEmail({ ...base, spaceTitle: 'Loft <b>"A"</b>\r\nBcc: x@example.invalid' });
	expect(msg.subject).toBe('New message about Loft <b>"A"</b> Bcc: x@example.invalid');
	expect(msg.subject).not.toMatch(/[\r\n]/);
	expect(msg.html).not.toContain("<b>");
	expect(msg.html).toContain("Loft &lt;b&gt;&quot;A&quot;&lt;/b&gt;");
});
