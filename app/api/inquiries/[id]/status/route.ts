import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { changeStatus } from "@/app/_lib/server/inquiryWrites";
import type { InquiryApiError, StatusResponse } from "@/app/_lib/types";

type Context = { params: Promise<{ id: string }> };
const error = (body: InquiryApiError, status: number) => Response.json(body, { status });

export async function POST(request: Request, { params }: Context): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);
	const { id } = await params;

	const body: unknown = await request.json().catch(() => null);
	const action = typeof body === "object" && body !== null && "action" in body ? body.action : undefined;
	if (action !== "decline" && action !== "close") return error({ error: "VALIDATION" }, 400);

	const outcome = await changeStatus(id, user.id, action);
	switch (outcome.kind) {
		case "ok":
			return Response.json({ status: outcome.status } satisfies StatusResponse);
		case "not-found":
			return error({ error: "NOT_FOUND" }, 404);
		case "closed":
			return error({ error: "THREAD_CLOSED" }, 409);
		case "not-host":
			return error({ error: "NOT_HOST" }, 400);
	}
}
