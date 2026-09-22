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

type ActivityOverview = Awaited<
  ReturnType<typeof getDashboardActivityOverview>
>;
type PbiOverview = Awaited<ReturnType<typeof getDashboardPbiOverview>>;
type NativeRiskAlerts = Awaited<ReturnType<typeof getMyNativeTaskRiskAlerts>>;

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

async function DashboardSummarySection({
  activityPromise,
}: {
  activityPromise: Promise<ActivityOverview>;
}) {
  const { summary } = await activityPromise;
  return <DashboardSummaryCards {...summary} />;
}

async function DashboardPbiScoreSection({
  pbiPromise,
}: {
  pbiPromise: Promise<PbiOverview>;
}) {
  const { latestSnapshot } = await pbiPromise;
  return <PbiScoreCards snapshot={latestSnapshot} />;
}

async function DashboardPbiExplanationSection({
  pbiPromise,
  locale,
}: {
  pbiPromise: Promise<PbiOverview>;
  locale: string;
}) {
  const { latestSnapshot } = await pbiPromise;

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

  return <PbiExplanationPanel explanation={explanation} />;
}

async function DashboardBehaviourSection({
  activityPromise,
}: {
  activityPromise: Promise<ActivityOverview>;
}) {
  const { behaviourTrend } = await activityPromise;
  return <BehaviourTrendChart data={behaviourTrend} />;
}

async function DashboardPbiHistorySection({
  pbiPromise,
}: {
  pbiPromise: Promise<PbiOverview>;
}) {
  const { pbiHistory } = await pbiPromise;
  return <PbiHistoryChart data={pbiHistory} />;
}

async function DashboardTaskStatusSection({
  activityPromise,
}: {
  activityPromise: Promise<ActivityOverview>;
}) {
  const { taskStatusBreakdown } = await activityPromise;
  return <TaskStatusChart data={taskStatusBreakdown} />;
}

async function DashboardRiskSection({
  riskPromise,
}: {
  riskPromise: Promise<NativeRiskAlerts>;
}) {
  const alerts = await riskPromise;
  return <NativeTaskRiskAlertsCard alerts={alerts} />;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const [{ locale }, t, { supabase }] = await Promise.all([
    params,
    getTranslations("dashboard.header"),
    requireUser(),
  ]);

  // Start independent dashboard reads immediately. The same promises are shared
  // by multiple streamed sections, so each dataset is fetched only once.
  const activityPromise = getDashboardActivityOverview(supabase);
  const pbiPromise = getDashboardPbiOverview(supabase);
  const riskPromise = getMyNativeTaskRiskAlerts(6, supabase);

  return (
    <section>
      <div className="mx-auto max-w-full space-y-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
          action={<RefreshPbiButton />}
        />

        <Suspense fallback={<DashboardSectionSkeleton height="h-36" />}>
          <DashboardSummarySection activityPromise={activityPromise} />
        </Suspense>

        <Suspense fallback={<DashboardSectionSkeleton height="h-44" />}>
          <DashboardPbiScoreSection pbiPromise={pbiPromise} />
        </Suspense>

        <Suspense fallback={<DashboardSectionSkeleton height="h-72" />}>
          <DashboardPbiExplanationSection
            pbiPromise={pbiPromise}
            locale={locale}
          />
        </Suspense>

        <Suspense fallback={<DashboardSectionSkeleton height="h-80" />}>
          <DashboardBehaviourSection activityPromise={activityPromise} />
        </Suspense>

        <div className="grid gap-6 xl:grid-cols-2">
          <Suspense fallback={<DashboardSectionSkeleton height="h-72" />}>
            <DashboardPbiHistorySection pbiPromise={pbiPromise} />
          </Suspense>

          <Suspense fallback={<DashboardSectionSkeleton height="h-72" />}>
            <DashboardTaskStatusSection activityPromise={activityPromise} />
          </Suspense>
        </div>

        <Suspense fallback={<DashboardSectionSkeleton height="h-64" />}>
          <DashboardRiskSection riskPromise={riskPromise} />
        </Suspense>
      </div>
    </section>
  );
}
