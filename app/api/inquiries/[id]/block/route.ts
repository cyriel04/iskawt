import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { blockCounterpart, unblockCounterpart, type BlockResult } from "@/app/_lib/server/blocks";
import type { BlockResponse, InquiryApiError } from "@/app/_lib/types";

type Context = { params: Promise<{ id: string }> };
const error = (body: InquiryApiError, status: number) => Response.json(body, { status });

function respond(outcome: BlockResult): Response {
	switch (outcome.kind) {
		case "ok":
			return Response.json({ blockedByMe: outcome.blockedByMe } satisfies BlockResponse);
		case "not-found":
			return error({ error: "NOT_FOUND" }, 404);
		case "not-linked":
			return error({ error: "NOT_LINKED" }, 409);
	}
}

export async function POST(_request: Request, { params }: Context): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);
	const { id } = await params;
	return respond(await blockCounterpart(id, user.id));
}

export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);
	const { id } = await params;
	return respond(await unblockCounterpart(id, user.id));
}
