import { Suspense } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { FocusOverview } from "@/features/dashboard/components/focus-overview";
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
// import { NativeTaskRiskAlertsCard } from "@/features/native-task-risk/components/native-task-risk-alerts-card";
// import { getMyNativeTaskRiskAlerts } from "@/features/native-task-risk/native-task-risk.queries";
import { PbiExplanationPanel } from "@/features/pbi/components/pbi-explaination-panel";
import { RefreshPbiButton } from "@/features/pbi/components/refresh-pbi-button";
import { PbiScoreCards } from "@/features/pbi/components/pbi-score-cards";
import { translatePbiExplanationPayload } from "@/features/pbi/pbi-translations.server";
import type { PbiExplanationPayload } from "@/features/pbi/pbi.types";
import { requireUser } from "@/lib/auth/require-user";

type DashboardPageProps = {
  searchParams: Promise<{ focusPeriod?: string }>;
  params: Promise<{
    locale: string;
  }>;
};

type ActivityOverview = Awaited<
  ReturnType<typeof getDashboardActivityOverview>
>;
type PbiOverview = Awaited<ReturnType<typeof getDashboardPbiOverview>>;
// type NativeRiskAlerts = Awaited<ReturnType<typeof getMyNativeTaskRiskAlerts>>;

function normalizeAiLocale(locale: string) {
  return locale === "vi" ? "vi" : "en";
}

function DashboardSectionSkeleton({ height = "h-56" }: { height?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`${height} animate-pulse rounded-lg border border-border bg-muted`}
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
  const explanation =
    latestSnapshot?.explanation_payload &&
    typeof latestSnapshot.explanation_payload === "object"
      ? (latestSnapshot.explanation_payload as PbiExplanationPayload)
      : null;

  return <PbiScoreCards explanation={explanation} snapshot={latestSnapshot} />;
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

// async function DashboardRiskSection({
//   riskPromise,
// }: {
//   riskPromise: Promise<NativeRiskAlerts>;
// }) {
//   const alerts = await riskPromise;
//   return <NativeTaskRiskAlertsCard alerts={alerts} />;
// }

export default async function DashboardPage({ params, searchParams }: DashboardPageProps) {
  const [{ locale }, headerT, { supabase }, { focusPeriod }, focusT] = await Promise.all([
    params,
    getTranslations("dashboard.header"),
    requireUser(),
    searchParams,
    getTranslations("focus.startForm"),
  ]);

  // Start independent dashboard reads immediately. The same promises are shared
  // by multiple streamed sections, so each dataset is fetched only once.
  const activityPromise = getDashboardActivityOverview(supabase);
  const pbiPromise = getDashboardPbiOverview(supabase);
  // const riskPromise = getMyNativeTaskRiskAlerts(6, supabase);

  return (
    <section>
      <div className="mx-auto min-w-0 max-w-full space-y-5">
        <PageHeader
          eyebrow={headerT("eyebrow")}
          title={headerT("title")}
          description={headerT("description")}
          action={<>
            <Button asChild><Link href="/focus"><Play aria-hidden="true" />{focusT("start")}</Link></Button>
            <RefreshPbiButton />
          </>}
        />

        <Suspense fallback={
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <DashboardSectionSkeleton key={index} height="h-36" />
            ))}
          </div>
        }>
          <DashboardSummarySection activityPromise={activityPromise} />
        </Suspense>

        <Suspense fallback={<DashboardSectionSkeleton height="h-80" />}>
          <FocusOverview days={focusPeriod === "7" ? 7 : 30} />
        </Suspense>

        <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-2">
          <Suspense fallback={<DashboardSectionSkeleton height="h-80" />}>
            <DashboardPbiScoreSection pbiPromise={pbiPromise} />
          </Suspense>
          <div className="min-w-0 space-y-4">
            <Suspense fallback={<DashboardSectionSkeleton height="h-64" />}>
              <DashboardBehaviourSection activityPromise={activityPromise} />
            </Suspense>
            <Suspense fallback={<DashboardSectionSkeleton height="h-52" />}>
              <DashboardPbiExplanationSection pbiPromise={pbiPromise} locale={locale} />
            </Suspense>
          </div>
        </div>

        <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-2">
          <Suspense fallback={<DashboardSectionSkeleton height="h-64" />}>
            <DashboardPbiHistorySection pbiPromise={pbiPromise} />
          </Suspense>
          <Suspense fallback={<DashboardSectionSkeleton height="h-64" />}>
            <DashboardTaskStatusSection activityPromise={activityPromise} />
          </Suspense>
        </div>

        {/* <Suspense fallback={<DashboardSectionSkeleton height="h-64" />}>
          <DashboardRiskSection riskPromise={riskPromise} />
        </Suspense> */}
      </div>
    </section>
  );
}
