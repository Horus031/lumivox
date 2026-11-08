import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { PageLoading } from "@/features/app-shell/components/page-loading";

import { StudyPlanContent } from "@/features/learning-schedule/components/study-plan-content";

export default async function StudyPlanPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [params, t] = await Promise.all([searchParams, getTranslations("studyPlan")]);
  // Default browsing month is UTC; it is never used as the Today predicate.
  const month = params.month ?? new Date().toISOString().slice(0, 7);
  return <section className="min-w-0 space-y-section">
    <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
    <Suspense key={month} fallback={<PageLoading label={t("loading")} />}><StudyPlanContent month={month} /></Suspense>
  </section>;
}
