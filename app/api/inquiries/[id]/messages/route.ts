import { after } from "next/server";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { getMessagesAfter } from "@/app/_lib/server/inquiries";
import { postMessage } from "@/app/_lib/server/inquiryWrites";
import { notifyCounterpart } from "@/app/_lib/server/inquiryNotify";
import { validateMessageBody } from "@/app/_lib/inquiryValidation";
import type { InquiryApiError, MessagesResponse, PostMessageResponse } from "@/app/_lib/types";

type Context = { params: Promise<{ id: string }> };
const error = (body: InquiryApiError, status: number) => Response.json(body, { status });

export async function GET(request: Request, { params }: Context): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);
	const { id } = await params;
	const cursor = new URL(request.url).searchParams.get("after");
	const result = await getMessagesAfter(id, user.id, cursor);
	if (!result) return error({ error: "NOT_FOUND" }, 404);
	return Response.json(result satisfies MessagesResponse);
}

export async function POST(request: Request, { params }: Context): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);
	const { id } = await params;

	const body: unknown = await request.json().catch(() => null);
	const raw = typeof body === "object" && body !== null && "body" in body ? body.body : undefined;
	const validated = validateMessageBody(raw);
	if (!validated.ok) return error({ error: "VALIDATION" }, 400);

	const outcome = await postMessage(id, user.id, validated.value);
	switch (outcome.kind) {
		case "sent":
			after(() => notifyCounterpart(id, outcome.role, validated.value));
			return Response.json({ message: outcome.message } satisfies PostMessageResponse, { status: 201 });
		case "not-found":
			return error({ error: "NOT_FOUND" }, 404);
		case "closed":
			return error({ error: "THREAD_CLOSED" }, 409);
		case "rate-limited":
			return error({ error: "RATE_LIMITED" }, 429);
	}
}
