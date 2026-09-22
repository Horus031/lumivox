import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { BehaviourTrendChart } from "@/features/dashboard/components/behaviour-trend-chart";
import { DashboardSummaryCards } from "@/features/dashboard/components/dashboard-summary-cards";
import { PbiHistoryChart } from "@/features/dashboard/components/pbi-history-chart";
import { TaskStatusChart } from "@/features/dashboard/components/task-status-chart";
import {
  getDashboardActivityOverview,
  getDashboardPbiOverview,
} from "@/features/dashboard/dashboard.queries";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { NativeTaskRiskAlertsCard } from "@/features/native-task-risk/components/native-task-risk-alerts-card";
import { getMyNativeTaskRiskAlerts } from "@/features/native-task-risk/native-task-risk.queries";
import { PbiExplanationPanel } from "@/features/pbi/components/pbi-explaination-panel";
import { RefreshPbiButton } from "@/features/pbi/components/refresh-pbi-button";
import { PbiScoreCards } from "@/features/pbi/components/pbi-score-cards";
import { translatePbiExplanationPayload } from "@/features/pbi/pbi-translations.server";
import type { PbiExplanationPayload } from "@/features/pbi/pbi.types";
import { requireUser } from "@/lib/auth/require-user";

type DashboardPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

function normalizeAiLocale(locale: string) {
  return locale === "vi" ? "vi" : "en";
}

function DashboardSectionSkeleton({ height = "h-56" }: { height?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`${height} animate-pulse rounded-[28px] border border-border/60 bg-card/60`}
    />
  );
}

async function DashboardActivitySection() {
  const { supabase } = await requireUser();
  const { summary, behaviourTrend, taskStatusBreakdown } =
    await getDashboardActivityOverview(supabase);

  return (
    <>
      <DashboardSummaryCards {...summary} />

      <BehaviourTrendChart data={behaviourTrend} />

      <TaskStatusChart data={taskStatusBreakdown} />
    </>
  );
}

async function DashboardPbiSection({ locale }: { locale: string }) {
  const { supabase } = await requireUser();
  const { latestSnapshot, pbiHistory } =
    await getDashboardPbiOverview(supabase);

  const sourceExplanation =
    latestSnapshot?.explanation_payload &&
    typeof latestSnapshot.explanation_payload === "object"
      ? (latestSnapshot.explanation_payload as PbiExplanationPayload)
      : null;

  const explanation = await translatePbiExplanationPayload(
    sourceExplanation,
    latestSnapshot?.id,
    normalizeAiLocale(locale),
  );

  return (
    <>
      <PbiScoreCards snapshot={latestSnapshot} />
      <PbiExplanationPanel explanation={explanation} />
      <PbiHistoryChart data={pbiHistory} />
    </>
  );
}

async function DashboardRiskSection() {
  const { supabase } = await requireUser();
  const alerts = await getMyNativeTaskRiskAlerts(6, supabase);

  return <NativeTaskRiskAlertsCard alerts={alerts} />;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const [{ locale }, t] = await Promise.all([
    params,
    getTranslations("dashboard.header"),
  ]);

  return (
    <section>
      <div className="mx-auto max-w-full space-y-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
          action={<RefreshPbiButton />}
        />

        <Suspense fallback={<DashboardSectionSkeleton height="h-96" />}>
          <DashboardActivitySection />
        </Suspense>

        <Suspense fallback={<DashboardSectionSkeleton height="h-80" />}>
          <DashboardPbiSection locale={locale} />
        </Suspense>

        <Suspense fallback={<DashboardSectionSkeleton height="h-64" />}>
          <DashboardRiskSection />
        </Suspense>
      </div>
    </section>
  );
}
