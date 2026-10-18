import { reportReasonLabels } from "@/app/_lib/constants/labels";
import { ReportReason } from "@/generated/prisma/enums";

it("labels every report reason", () => {
	expect(Object.keys(reportReasonLabels).sort()).toEqual(Object.values(ReportReason).sort());
	expect(reportReasonLabels).toEqual({
		SPAM: "Spam",
		SCAM_OR_PHISHING: "Scam or phishing",
		HARASSMENT: "Harassment",
		NOT_THEIR_SPACE: "Not their space to list",
		OTHER: "Something else",
	});
});
