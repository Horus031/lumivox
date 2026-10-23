"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { loadFocusAnalyticsAction } from "../focus-v2-analytics.actions";
import type { FocusV2AnalyticsReport } from "../focus-v2-analytics.model";

function formattedSeconds(seconds: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(seconds / 3600);
}

export function FocusV2AnalyticsView({ initialReport, recentSessions }: {
  initialReport: FocusV2AnalyticsReport;
  recentSessions?: ReactNode;
}) {
  const t = useTranslations("focus.analytics");
  const locale = useLocale();
  const [report, setReport] = useState(initialReport);
  const [selectedDays, setSelectedDays] = useState(initialReport.days);
  const [isPending, startTransition] = useTransition();
  const days = report.days;

  function selectPeriod(period: 7 | 30) {
    if (isPending || period === days) return;
    setSelectedDays(period);
    startTransition(async () => {
      try {
        const result = await loadFocusAnalyticsAction(period);
        if (!result.success) throw new Error("Analytics unavailable");
        setReport(result.report);
        const url = new URL(window.location.href);
        url.searchParams.set("focusPeriod", String(period));
        window.history.replaceState(null, "", url);
      } catch {
        setSelectedDays(days);
        toast.error(t("loadError"));
      }
    });
  }
  const maxMinutes = Math.max(1, ...report.daily.map(day => day.focusSeconds / 60));
  const number = new Intl.NumberFormat(locale);
  const rate = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const stats = [
    { title: t("focusHours"), value: formattedSeconds(report.focusSeconds, locale) },
    { title: t("breakHours"), value: formattedSeconds(report.breakSeconds, locale) },
    { title: t("pausedHours"), value: formattedSeconds(report.pausedSeconds, locale) },
    { title: t("completionRate"), value: `${rate.format(report.completionRatePercent)}%` },
    { title: t("completedSessions"), value: number.format(report.completedSessions) },
    { title: t("completedRounds"), value: number.format(report.completedRounds) },
    { title: t("distractions"), value: number.format(report.distractionsCount) },
    { title: t("distractionMinutes"), value: number.format(Math.floor(report.distractionSeconds / 60)) },
  ];
  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm" aria-label={t("title")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-section font-semibold">{t("title")}</h2>
          <p className="text-caption text-muted-foreground">{t("subtitle", { days })}</p>
        </div>
        <nav aria-label={t("periodLabel")} className="flex shrink-0 gap-1 rounded-lg bg-muted p-1 text-caption">
          {([7, 30] as const).map(period => (
            <button key={period} type="button" onClick={() => selectPeriod(period)}
              disabled={isPending} aria-pressed={selectedDays === period}
              className={`min-h-9 rounded-md px-3 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-wait ${selectedDays === period ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t(period === 7 ? "sevenDays" : "thirtyDays")}
            </button>
          ))}
        </nav>
      </div>
      <div aria-busy={isPending} aria-live="polite">
      {isPending ? <FocusAnalyticsSkeleton label={t("loading")} /> : <div className="space-y-4">
      {report.truncated && (
        <p role="alert" className="rounded-md border border-amber-500/50 px-3 py-2 text-body">
          {t("partialWarning")}
        </p>
      )}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {[stats[0], stats[3], stats[4], stats[6]].map(stat => (
          <div key={stat.title} className="min-w-0 rounded-xl bg-muted/40 p-3">
            <p className="text-caption text-muted-foreground">{stat.title}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>
      <p className="text-caption text-muted-foreground">
        {t("sessionBreakdown", { total: report.sessionCount, active: report.activeSessions,
          completed: report.completedSessions, cancelled: report.cancelledSessions })}
      </p>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2">
          <h3 className="text-label font-semibold">{t("dailyTitle")}</h3>
          <div className="flex h-32 items-end gap-1 rounded-xl bg-muted/30 px-3 pb-2 pt-4" role="img"
            aria-label={t("dailyDescription")}>
            {report.daily.map(day => {
              const minutes = Math.round(day.focusSeconds / 60);
              const heightPercent = day.focusSeconds === 0 ? 0 : Math.max(3, (day.focusSeconds / 60) / maxMinutes * 100);
              return <div key={day.date} title={`${day.date} (UTC): ${minutes} min`}
                className="flex min-w-0 flex-1 flex-col items-center justify-end self-stretch">
                <div className="w-full rounded-t-sm bg-primary/75" style={{ height: `${heightPercent}%` }} />
              </div>;
            })}
          </div>
          <p className="text-caption text-muted-foreground">{t("utcMethodology")}</p>
        </div>
        <div className="min-w-0 border-t border-border pt-4 lg:border-t-0 lg:border-l lg:pl-5 lg:pt-0">{recentSessions}</div>
      </div>
      <details className="group border-t border-border pt-3">
        <summary className="cursor-pointer rounded-md text-label font-medium focus-visible:outline-2 focus-visible:outline-ring">{t("details")}</summary>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[stats[1], stats[2], stats[5], stats[7]].map(stat => (
              <div key={stat.title} className="rounded-xl bg-muted/40 p-3">
                <p className="text-caption text-muted-foreground">{stat.title}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-card lg:grid-cols-2">
            <section className="space-y-2">
              <h3 className="text-label font-semibold">{t("tasksTitle")}</h3>
              {report.tasks.length === 0 ? <p className="text-body text-muted-foreground">{t("noTasks")}</p> : (
                <ol className="divide-y divide-border">
                  {report.tasks.map(task => <li key={task.taskId} className="flex justify-between gap-3 py-2 text-body">
                    <span className="min-w-0 break-words">{task.title || t("deletedTask")}</span>
                    <span className="shrink-0 tabular-nums">{number.format(Math.floor(task.focusSeconds / 60))} {t("minutes")}</span>
                  </li>)}
                </ol>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="text-label font-semibold">{t("engagementTitle")}</h3>
              <p className="text-body">{t("currentStreak")}: <strong>{report.engagement ? number.format(report.engagement.current_streak_days) : "—"}</strong></p>
              <p className="text-body">{t("longestStreak")}: <strong>{report.engagement ? number.format(report.engagement.longest_streak_days) : "—"}</strong></p>
              <p className="text-body">{t("tokenBalance")}: <strong>{report.engagement ? number.format(report.engagement.token_balance) : "—"}</strong></p>
              <p className="text-body">{t("focusRewards")}: <strong>{number.format(report.rewardsCount)}</strong></p>
              <p className="text-body">{t("focusTokens")}: <strong>{number.format(report.rewardTokens)}</strong></p>
              <p className="text-caption text-muted-foreground">{t("rewardMethodology")}</p>
            </section>
          </div>
          <section className="space-y-2">
            <h3 className="text-label font-semibold">{t("categoriesTitle")}</h3>
            {report.distractionTypes.length === 0
              ? <p className="text-body text-muted-foreground">{t("noDistractions")}</p>
              : <div className="flex flex-wrap gap-2">{report.distractionTypes.map(entry =>
                  <span key={entry.kind} className="rounded-md border border-border px-3 py-2 text-label">
                    {t(`categories.${entry.kind as "social_media" | "messaging" | "external_interrupt" | "fatigue" | "other"}`)}: {entry.count}
                  </span>
                )}</div>}
          </section>
          <p className="text-caption text-muted-foreground">{t("dataMethodology")}</p>
        </div>
      </details>
      </div>}
      </div>
    </section>
  );
}

function FocusAnalyticsSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />)}
      </div>
      <div aria-hidden="true" className="grid gap-5 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
      <div aria-hidden="true" className="h-8 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
