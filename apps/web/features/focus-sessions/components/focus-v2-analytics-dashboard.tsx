import { getLocale, getTranslations } from "next-intl/server";
import { getFocusV2Analytics } from "../focus-v2-analytics.queries";

function formattedSeconds(seconds: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(seconds / 3600);
}

export async function FocusV2AnalyticsDashboard({ days = 30 }: { days?: 7 | 30 }) {
  const [t, locale] = await Promise.all([getTranslations("focus.analytics"), getLocale()]);
  let report;
  try {
    report = await getFocusV2Analytics(days);
  } catch {
    // Analytics is noncritical: never take down the active Focus timer on DB errors.
    return <section role="alert" className="rounded-lg border border-border p-card">
      <h2 className="text-section font-semibold">{t("title")}</h2>
      <p className="text-body text-muted-foreground">{t("loadError")}</p>
    </section>;
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
    <section className="min-w-0 space-y-card rounded-lg border border-border bg-card p-card" aria-label={t("title")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-section font-semibold">{t("title")}</h2>
          <p className="text-caption text-muted-foreground">{t("subtitle", { days })}</p>
        </div>
        <nav aria-label={t("periodLabel")} className="flex gap-2 text-label">
          <a href="?focusPeriod=7" aria-current={days === 7 ? "page" : undefined}
            className="rounded-md border border-border px-3 py-2 hover:bg-muted">{t("sevenDays")}</a>
          <a href="?focusPeriod=30" aria-current={days === 30 ? "page" : undefined}
            className="rounded-md border border-border px-3 py-2 hover:bg-muted">{t("thirtyDays")}</a>
        </nav>
      </div>
      {report.truncated && (
        <p role="alert" className="rounded-md border border-amber-500/50 px-3 py-2 text-body">
          {t("partialWarning")}
        </p>
      )}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {stats.map(stat => (
          <div key={stat.title} className="min-w-0 rounded-lg border border-border p-3">
            <p className="text-caption text-muted-foreground">{stat.title}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>
      <p className="text-caption text-muted-foreground">
        {t("sessionBreakdown", { total: report.sessionCount, active: report.activeSessions,
          completed: report.completedSessions, cancelled: report.cancelledSessions })}
      </p>
      <div className="space-y-2">
        <h3 className="text-label font-semibold">{t("dailyTitle")}</h3>
        <div className="flex h-36 items-end gap-1 overflow-x-auto rounded-md border border-border px-2 pb-2 pt-4" role="img"
          aria-label={t("dailyDescription")}>
          {report.daily.map(day => {
            const minutes = Math.round(day.focusSeconds / 60);
            const heightPercent = day.focusSeconds === 0 ? 0 : Math.max(3, (day.focusSeconds / 60) / maxMinutes * 100);
            return <div key={day.date} title={`${day.date} (UTC): ${minutes} min`}
              className="flex min-w-2 flex-1 flex-col items-center justify-end self-stretch">
              <div className="w-full rounded-t-sm bg-primary" style={{ height: `${heightPercent}%` }} />
            </div>;
          })}
        </div>
        <p className="text-caption text-muted-foreground">{t("utcMethodology")}</p>
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
    </section>
  );
}
