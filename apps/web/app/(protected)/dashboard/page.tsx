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
import { PbiExplanationPanel } from "@/features/pbi/components/pbi-explaination-panel";

import { getLatestAiInsightCards } from "@/features/ai-insights/ai-insight.queries";
import { AiInsightSection } from "@/features/ai-insights/components/ai-insight-section";

import { getLatestNativeTaskRiskAssessments } from "@/features/native-task-risk/native-task-risk.queries";
import { NativeTaskRiskSection } from "@/features/native-task-risk/components/native-task-risk-section";

import { getLatestNativeTaskAiInsights } from "@/features/native-task-insights/native-task-insight.queries";
import { NativeTaskAiInsightSection } from "@/features/native-task-insights/components/native-task-ai-insight-section";

import { PageHeader } from "@/features/app-shell/components/page-header";

export default async function DashboardPage() {
  const [
    summary,
    latestSnapshot,
    behaviourTrend,
    pbiHistory,
    taskStatusBreakdown,
    aiInsightCards,
    nativeTaskRiskAssessments,
    nativeTaskAiInsights,
  ] = await Promise.all([
    getDashboardSummary(),
    getLatestPbiSnapshot(),
    getBehaviourTrend(),
    getPbiSnapshotHistory(),
    getTaskStatusBreakdown(),
    getLatestAiInsightCards(),
    getLatestNativeTaskRiskAssessments(),
    getLatestNativeTaskAiInsights(),
  ]);

  const explanation =
    latestSnapshot?.explanation_payload &&
    typeof latestSnapshot.explanation_payload === "object"
      ? (latestSnapshot.explanation_payload as PbiExplanationPayload)
      : null;

  return (
    <section className="px-4 py-6 md:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-full space-y-8">
        <PageHeader
          eyebrow="Lumivox"
          title="Behaviour Analytics Dashboard"
          description="Review your recent productivity behaviour, visualise study patterns, and understand the reasoning behind your behavioural signals."
          action={<RefreshPbiButton />}
        />

        <DashboardSummaryCards {...summary} />

        <PbiScoreCards snapshot={latestSnapshot} />

        <BehaviourTrendChart data={behaviourTrend} />

        <div className="grid gap-6 xl:grid-cols-2">
          <PbiHistoryChart data={pbiHistory} />
          <TaskStatusChart data={taskStatusBreakdown} />
        </div>

        <PbiExplanationPanel explanation={explanation} />

        <NativeTaskRiskSection assessments={nativeTaskRiskAssessments} />

        <NativeTaskAiInsightSection cards={nativeTaskAiInsights} />

        <AiInsightSection cards={aiInsightCards} />
      </div>
    </section>
  );
}
