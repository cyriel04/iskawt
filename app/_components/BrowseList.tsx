import { connection } from "next/server";
import BrowseResults from "@/app/_components/BrowseResults";
import { listPublishedSpaces } from "@/app/_lib/server/spaces";

export default async function BrowseList() {
	// Listings change without a deploy, so never prerender this at build time.
	await connection();
	const spaces = await listPublishedSpaces();

	return <BrowseResults spaces={spaces} />;
}
