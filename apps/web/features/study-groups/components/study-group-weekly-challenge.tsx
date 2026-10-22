import { useLocale, useTranslations } from "next-intl";

type ChallengeProgress = {
  group_id: string;
  week_start: string;
  week_end: string;
  target_focus_minutes: number;
  target_completed_tasks: number;
  actual_focus_minutes: number;
  actual_completed_tasks: number;
  focus_progress_percent: number;
  task_progress_percent: number;
};

type StudyGroupWeeklyChallengeProps = {
  progress: ChallengeProgress | null;
};

function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary"
        style={{
          width: `${percent}%`,
        }}
      />
    </div>
  );
}

export function StudyGroupWeeklyChallenge({
  progress,
}: StudyGroupWeeklyChallengeProps) {
  const locale = useLocale();
  const t = useTranslations("groups.weeklyChallengePanel");
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });

  if (!progress) {
    return (
      <section className="min-w-0 border-t border-border pt-card">
        <h2 className="text-section font-semibold text-foreground">
          {t("eyebrow")}
        </h2>

        <p className="mt-2 text-body text-secondary-text">
          {t("empty")}
        </p>
      </section>
    );
  }

  return (
    <section className="min-w-0 border-t border-border pt-card">
      <p className="text-caption font-medium text-muted-foreground">
        {t("eyebrow")}
      </p>

      <h2 className="mt-2 text-section font-semibold text-foreground">
        {t("title")}
      </h2>

      <p className="mt-2 text-body text-secondary-text">
        {dateFormatter.format(new Date(progress.week_start))} -{" "}
        {dateFormatter.format(new Date(progress.week_end))}
      </p>

      <div className="mt-card space-y-card">
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-body">
            <span className="font-medium text-foreground">
              {t("focusMinutes")}
            </span>

            <span className="text-secondary-text">
              {t("focusMetric", {
                actual: progress.actual_focus_minutes,
                target: progress.target_focus_minutes,
              })}
            </span>
          </div>

          <ProgressBar label={t("focusMinutes")} value={progress.focus_progress_percent} />

          <p className="mt-2 text-caption text-muted-foreground">
            {t("completedPercent", {
              percent: progress.focus_progress_percent,
            })}
          </p>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-body">
            <span className="font-medium text-foreground">
              {t("completedTasks")}
            </span>

            <span className="text-secondary-text">
              {t("taskMetric", {
                actual: progress.actual_completed_tasks,
                target: progress.target_completed_tasks,
              })}
            </span>
          </div>

          <ProgressBar label={t("completedTasks")} value={progress.task_progress_percent} />

          <p className="mt-2 text-caption text-muted-foreground">
            {t("completedPercent", {
              percent: progress.task_progress_percent,
            })}
          </p>
        </div>
      </div>
    </section>
  );
}
