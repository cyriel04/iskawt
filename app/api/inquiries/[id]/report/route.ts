import { after } from "next/server";
import { validateNewReport } from "@/app/_lib/reportValidation";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { notifyReport } from "@/app/_lib/server/reportNotify";
import { createReport } from "@/app/_lib/server/reports";
import type { CreateReportResponse, ReportApiError } from "@/app/_lib/types";

type Context = { params: Promise<{ id: string }> };
const error = (body: ReportApiError, status: number) => Response.json(body, { status });

export async function POST(request: Request, { params }: Context): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);
	const { id } = await params;

	const body: unknown = await request.json().catch(() => null);
	const result = validateNewReport(body);
	if (!result.ok) return error({ error: "VALIDATION", fields: result.errors }, 400);

	const outcome = await createReport(id, user.id, result.value);
	switch (outcome.kind) {
		case "created":
			after(() => notifyReport(outcome.id));
			return Response.json({ id: outcome.id } satisfies CreateReportResponse, { status: 201 });
		case "not-found":
			return error({ error: "NOT_FOUND" }, 404);
		case "rate-limited":
			return error({ error: "RATE_LIMITED" }, 429);
	}
}
