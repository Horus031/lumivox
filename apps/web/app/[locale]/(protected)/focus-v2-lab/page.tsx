import { notFound } from "next/navigation";
import { getActiveFocusV2Snapshot } from "@/features/focus-sessions/focus-v2.queries";
import { FocusV2Lab } from "@/features/focus-sessions/components/focus-v2-lab";

export const dynamic = "force-dynamic";

// QA-only route. No navigation link; production remains 404 with the default flag.
export default async function FocusV2LabPage() {
  if (process.env.FOCUS_V2_ENABLED !== "true" || process.env.FOCUS_V2_QA_LAB_ENABLED !== "true") notFound();
  const snapshot = await getActiveFocusV2Snapshot();
  return <FocusV2Lab initialSnapshot={snapshot} />;
}
