"use server";

import { getFocusV2Analytics } from "./focus-v2-analytics.queries";
import type { FocusV2AnalyticsReport } from "./focus-v2-analytics.model";

type AnalyticsResult = { success: true; report: FocusV2AnalyticsReport } | { success: false };

export async function loadFocusAnalyticsAction(days: 7 | 30): Promise<AnalyticsResult> {
  if (days !== 7 && days !== 30) return { success: false };
  try {
    // The query authenticates the user and scopes every report to their account.
    return { success: true, report: await getFocusV2Analytics(days) };
  } catch {
    return { success: false };
  }
}
