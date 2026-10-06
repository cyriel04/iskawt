import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/_lib/server/currentUser";

// The sign-in check lives here, above loading.tsx: a redirect from the page
// would stream as a 200 with a meta refresh. If more pages join (list), note
// that a layout does not re-run between pages that share it.
export default async function InboxListLayout({ children }: { children: ReactNode }) {
	if (!(await getCurrentUser())) redirect(`/sign-in?next=${encodeURIComponent("/inbox")}`);
	return children;
}
