/** @jest-environment node */
import { magicLinkEmail } from "@/app/_lib/server/magicLinkEmail";

it("builds the sign-in email with the link, expiry and site name", () => {
	const msg = magicLinkEmail("demo-user@example.invalid", "https://iskawt.example.invalid/api/auth/magic-link/verify?token=t");
	expect(msg.to).toBe("demo-user@example.invalid");
	expect(msg.subject).toBe("Sign in to Iskawt");
	expect(msg.text).toContain("https://iskawt.example.invalid/api/auth/magic-link/verify?token=t");
	expect(msg.text).toContain("15 minutes");
	expect(msg.html).toContain('href="https://iskawt.example.invalid/api/auth/magic-link/verify?token=t"');
});

it("escapes the URL in HTML", () => {
	const msg = magicLinkEmail("a@example.invalid", 'https://x.invalid/?a=1&b="2"');
	expect(msg.html).toContain("https://x.invalid/?a=1&amp;b=&quot;2&quot;");
});
