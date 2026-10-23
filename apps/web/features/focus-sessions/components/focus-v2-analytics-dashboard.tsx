import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { getFocusV2Analytics } from "../focus-v2-analytics.queries";
import { FocusV2AnalyticsView } from "./focus-v2-analytics-view";

export async function FocusV2AnalyticsDashboard({ days = 30, recentSessions }: { days?: 7 | 30; recentSessions?: ReactNode }) {
  const t = await getTranslations("focus.analytics");
  try {
    const report = await getFocusV2Analytics(days);
    return <FocusV2AnalyticsView initialReport={report} recentSessions={recentSessions} />;
  } catch {
    return <section role="alert" className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-section font-semibold">{t("title")}</h2>
      <p className="text-body text-muted-foreground">{t("loadError")}</p>
      <div className="mt-4">{recentSessions}</div>
    </section>;
  }
}
