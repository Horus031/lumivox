import {
  getBehaviourTrend,
  getDashboardSummary,
  getLatestPbiSnapshot,
  getPbiSnapshotHistory,
  getTaskStatusBreakdown,
} from "@/features/dashboard/dashboard.queries";

import { DashboardSummaryCards } from "@/features/dashboard/components/dashboard-summary-cards";
import { BehaviourTrendChart } from "@/features/dashboard/components/behaviour-trend-chart";
import { PbiHistoryChart } from "@/features/dashboard/components/pbi-history-chart";
import { TaskStatusChart } from "@/features/dashboard/components/task-status-chart";

import { RefreshPbiButton } from "@/features/pbi/components/refresh-pbi-button";
import { PbiScoreCards } from "@/features/pbi/components/pbi-score-cards";

import type { PbiExplanationPayload } from "@/features/pbi/pbi.types";
import { translatePbiExplanationPayload } from "@/features/pbi/pbi-translations.server";
import { PbiExplanationPanel } from "@/features/pbi/components/pbi-explaination-panel";

// import { getLatestAiInsightCards } from "@/features/ai-insights/ai-insight.queries";
// import { AiInsightSection } from "@/features/ai-insights/components/ai-insight-section";

// import { getLatestNativeTaskRiskAssessments } from "@/features/native-task-risk/native-task-risk.queries";
// import { NativeTaskRiskSection } from "@/features/native-task-risk/components/native-task-risk-section";

// import { getLatestNativeTaskAiInsights } from "@/features/native-task-insights/native-task-insight.queries";
// import { NativeTaskAiInsightSection } from "@/features/native-task-insights/components/native-task-ai-insight-section";

import { PageHeader } from "@/features/app-shell/components/page-header";
import { FrozenStreakAlert } from "@/features/engagement-retention/components/frozen-streak-alert";
import { getCurrentEngagementStats } from "@/features/engagement-retention/engagement-retention.queries";
import { getTranslations } from "next-intl/server";

type DashboardPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

function normalizeAiLocale(locale: string) {
  return locale === "vi" ? "vi" : "en";
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale } = await params;
  const aiLocale = normalizeAiLocale(locale);
  const t = await getTranslations("dashboard.header");
  const [
    summary,
    latestSnapshot,
    behaviourTrend,
    pbiHistory,
    taskStatusBreakdown,
    // aiInsightCards,
    // nativeTaskRiskAssessments,
    // nativeTaskAiInsights,
    engagementStats,
  ] = await Promise.all([
    getDashboardSummary(),
    getLatestPbiSnapshot(),
    getBehaviourTrend(),
    getPbiSnapshotHistory(),
    getTaskStatusBreakdown(),
    // getLatestAiInsightCards(),
    // getLatestNativeTaskRiskAssessments(),
    // getLatestNativeTaskAiInsights(),
    getCurrentEngagementStats(),
  ]);

  const sourceExplanation =
    latestSnapshot?.explanation_payload &&
    typeof latestSnapshot.explanation_payload === "object"
      ? (latestSnapshot.explanation_payload as PbiExplanationPayload)
      : null;
  const explanation = await translatePbiExplanationPayload(
    sourceExplanation,
    latestSnapshot?.id,
    aiLocale,
  );

  return (
    <section>
      <div className="mx-auto max-w-full space-y-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
          action={<RefreshPbiButton />}
        />

        <FrozenStreakAlert stats={engagementStats} />

        <DashboardSummaryCards {...summary} />

        <PbiScoreCards snapshot={latestSnapshot} />

        <PbiExplanationPanel explanation={explanation} />

        <BehaviourTrendChart data={behaviourTrend} />

        <div className="grid gap-6 xl:grid-cols-2">
          <PbiHistoryChart data={pbiHistory} />
          <TaskStatusChart data={taskStatusBreakdown} />
        </div>

        {/* Product Native Model for Production */}
        {/* <NativeTaskRiskSection assessments={nativeTaskRiskAssessments} /> */}

        {/* <NativeTaskAiInsightSection cards={nativeTaskAiInsights} /> */}

        {/* AI Insight Model Demo */}
        {/* <AiInsightSection cards={aiInsightCards} /> */}
      </div>
    </section>
  );
}
