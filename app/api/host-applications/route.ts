import { after } from "next/server";
import { validateNewHostApplication } from "@/app/_lib/hostApplicationValidation";
import { getCurrentUser } from "@/app/_lib/server/currentUser";
import { notifyHostApplication } from "@/app/_lib/server/hostApplicationNotify";
import { createHostApplication } from "@/app/_lib/server/hostApplications";
import type { CreateHostApplicationResponse, HostApplicationApiError } from "@/app/_lib/types";

const error = (body: HostApplicationApiError, status: number) => Response.json(body, { status });
const received = () => Response.json({ received: true } satisfies CreateHostApplicationResponse, { status: 201 });

// Signed-in users apply to list a space. The response never echoes anything
// back: there is nothing for the applicant to look up, and the address is ops-only.
export async function POST(request: Request): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return error({ error: "UNAUTHENTICATED" }, 401);

	const body: unknown = await request.json().catch(() => null);
	const result = validateNewHostApplication(body);
	if (!result.ok) return error({ error: "VALIDATION", fields: result.errors }, 400);

	// Spam trap: answer as if it worked, keep nothing.
	if (result.value.website) return received();

	const outcome = await createHostApplication({ id: user.id, email: user.email }, result.value);
	if (outcome.kind === "rate-limited") return error({ error: "RATE_LIMITED" }, 429);

	const { spaceType, city, areaName } = result.value;
	const existingHost = user.host !== null;
	after(() => notifyHostApplication({ applicationId: outcome.id, spaceType, city, areaName, existingHost }));
	return received();
}
