import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { PageLoading } from "@/features/app-shell/components/page-loading";
import { getStudyPlanAction } from "@/features/learning-schedule/study-plan.queries.actions";
import { StudyPlanOverview } from "@/features/learning-schedule/components/study-plan-overview";
import { StudyCalendar } from "@/features/learning-schedule/components/study-calendar";
import { TodaysStudyPlan } from "@/features/learning-schedule/components/todays-study-plan";

async function StudyPlanContent({ month }: { month: string }) {
  const [result, t] = await Promise.all([getStudyPlanAction({ month }), getTranslations("studyPlan")]);
  if (!result.success) return <div role="alert" className="rounded-lg border border-border p-5">
    <p>{t(`error.${result.code}`)}</p><Link href="/study-plan" className="mt-3 inline-block underline">{t("retry")}</Link>
  </div>;
  return <div className="space-y-6">
    <StudyPlanOverview summary={result.summary} />
    <TodaysStudyPlan sessions={result.today} />
    <StudyCalendar month={month} days={result.calendar} />
    <p className="text-xs text-secondary-text">{t("asOf", { instant: result.asOf })}</p>
  </div>;
}
export default async function StudyPlanPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [params, t] = await Promise.all([searchParams, getTranslations("studyPlan")]);
  // Default browsing month is UTC; it is never used as the Today predicate.
  const month = params.month ?? new Date().toISOString().slice(0, 7);
  return <section className="min-w-0 space-y-section">
    <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
    <Suspense key={month} fallback={<PageLoading label={t("loading")} />}><StudyPlanContent month={month} /></Suspense>
  </section>;
}
