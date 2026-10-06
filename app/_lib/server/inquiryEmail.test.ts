/** @jest-environment node */
import { inquiryMessageEmail } from "@/app/_lib/server/inquiryEmail";

const base = {
	to: "demo-host@example.invalid",
	spaceTitle: "[DEMO] Corner loft",
	senderName: "Demo Renter",
	body: "Free on the 20th?\nWe're 12 people.",
	url: "http://localhost:3000/inbox/inq_1",
	hostNotLinked: false,
};

it("addresses the recipient and names the space in the subject", () => {
	const msg = inquiryMessageEmail(base);
	expect(msg.to).toBe("demo-host@example.invalid");
	expect(msg.subject).toBe("New message about [DEMO] Corner loft");
});

it("includes sender name, message and reply link; says email replies aren't delivered", () => {
	const msg = inquiryMessageEmail(base);
	expect(msg.text).toContain("Demo Renter wrote about [DEMO] Corner loft:");
	expect(msg.text).toContain("Free on the 20th?\nWe're 12 people.");
	expect(msg.text).toContain("Reply on Iskawt: http://localhost:3000/inbox/inq_1");
	expect(msg.text).toContain("Replies to this email aren't delivered.");
	expect(msg.html).toContain('href="http://localhost:3000/inbox/inq_1"');
	expect(msg.html).toContain("Free on the 20th?<br>We&#39;re 12 people.");
});

it("tells an unlinked host to sign in with this address", () => {
	const msg = inquiryMessageEmail({ ...base, hostNotLinked: true, url: "http://localhost:3000/sign-in?next=%2Finbox%2Finq_1" });
	expect(msg.text).toContain("Sign in with this email address to read and reply: http://localhost:3000/sign-in?next=%2Finbox%2Finq_1");
});

it("escapes HTML in every interpolated value and strips CR/LF from the subject", () => {
	const msg = inquiryMessageEmail({
		...base,
		spaceTitle: 'Loft <b>"A"</b>\r\nBcc: x@example.invalid',
		senderName: "<img src=x onerror=alert(1)>",
		body: "<script>alert(1)</script>",
	});
	expect(msg.subject).toBe('New message about Loft <b>"A"</b> Bcc: x@example.invalid');
	expect(msg.subject).not.toMatch(/[\r\n]/);
	expect(msg.html).not.toContain("<script>");
	expect(msg.html).not.toContain("<img");
	expect(msg.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
	expect(msg.html).toContain("Loft &lt;b&gt;&quot;A&quot;&lt;/b&gt;");
});
