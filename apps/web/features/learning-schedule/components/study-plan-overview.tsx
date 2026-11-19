"use client";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import type { AttendanceSummary } from "../attendance-analytics";

export function StudyPlanOverview({ summary }: { summary: AttendanceSummary }) {
  const t = useTranslations("studyPlan"),
    locale = useLocale();
  const metrics = [
    {
      key: "attendance",
      value: summary.attendanceRate,
      done: summary.completedDue,
      total: summary.eligibleDue,
    },
    {
      key: "onTime",
      value: summary.onTimeRate,
      done: summary.onTimeDue,
      total: summary.eligibleDue,
    },
    {
      key: "coverage",
      value: summary.plannedCoverage,
      done: summary.completedPlanned,
      total: summary.eligiblePlanned,
    },
  ] as const;
  return (
    <section aria-label={t("overview")} className="space-y-3">
      <p className="text-sm text-secondary-text">{t("summaryScope")}</p>
      <p className="text-sm text-secondary-text">{t("refreshHint")}</p>
      <dl className="grid gap-4 sm:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.key} className="p-5">
            <dt className="text-sm text-secondary-text">{t(metric.key)}</dt>
            <dd className="mt-2 text-3xl font-semibold tabular-nums">
              {metric.value === null
                ? t("na")
                : new Intl.NumberFormat(locale, {
                    style: "percent",
                    maximumFractionDigits: 1,
                  }).format(metric.value / 100)}
            </dd>
            <dd className="mt-2 text-sm text-secondary-text">
              {t("ratio", { done: metric.done, total: metric.total })}
            </dd>
          </Card>
        ))}
      </dl>
    </section>
  );
}
