import { after } from "next/server";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { createInquiry } from "@/app/_lib/server/inquiryWrites";
import { notifyCounterpart } from "@/app/_lib/server/inquiryNotify";
import { manilaToday, validateNewInquiry } from "@/app/_lib/inquiryValidation";
import type { CreateInquiryResponse, InquiryApiError } from "@/app/_lib/types";

const error = (body: InquiryApiError, status: number) => Response.json(body, { status });

export async function POST(request: Request): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);

	const body: unknown = await request.json().catch(() => null);

	// Spam trap first: a bot that fills the hidden field gets a fake success,
	// whatever else it sent, so it learns nothing from validation errors.
	if (typeof body === "object" && body !== null && "website" in body && typeof body.website === "string" && body.website.trim() !== "") {
		return Response.json({ id: null, reused: false } satisfies CreateInquiryResponse, { status: 201 });
	}

	const result = validateNewInquiry(body, manilaToday());
	if (!result.ok) return error({ error: "VALIDATION", fields: result.errors }, 400);

	const outcome = await createInquiry(user.id, result.value);
	switch (outcome.kind) {
		case "created":
			after(() => notifyCounterpart(outcome.id, "RENTER", result.value.message));
			return Response.json({ id: outcome.id, reused: false } satisfies CreateInquiryResponse, { status: 201 });
		case "reused":
			after(() => notifyCounterpart(outcome.id, "RENTER", result.value.message));
			return Response.json({ id: outcome.id, reused: true } satisfies CreateInquiryResponse, { status: 200 });
		case "not-found":
			return error({ error: "NOT_FOUND" }, 404);
		case "own-space":
			return error({ error: "OWN_SPACE" }, 400);
		case "rate-limited":
			return error({ error: "RATE_LIMITED" }, 429);
	}
}
