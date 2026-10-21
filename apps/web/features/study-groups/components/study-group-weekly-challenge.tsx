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

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900">
      <div
        className="h-full rounded-full bg-neutral-900 dark:bg-white"
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
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
      <section className="rounded-2xl border bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-2xl font-bold text-neutral-950 dark:text-neutral-50">
          {t("eyebrow")}
        </h2>

        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {t("empty")}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {t("eyebrow")}
      </p>

      <h2 className="mt-2 text-2xl font-bold text-neutral-950 dark:text-neutral-50">
        {t("title")}
      </h2>

      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        {dateFormatter.format(new Date(progress.week_start))} -{" "}
        {dateFormatter.format(new Date(progress.week_end))}
      </p>

      <div className="mt-5 space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              {t("focusMinutes")}
            </span>

            <span className="text-neutral-600 dark:text-neutral-400">
              {t("focusMetric", {
                actual: progress.actual_focus_minutes,
                target: progress.target_focus_minutes,
              })}
            </span>
          </div>

          <ProgressBar value={progress.focus_progress_percent} />

          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            {t("completedPercent", {
              percent: progress.focus_progress_percent,
            })}
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              {t("completedTasks")}
            </span>

            <span className="text-neutral-600 dark:text-neutral-400">
              {t("taskMetric", {
                actual: progress.actual_completed_tasks,
                target: progress.target_completed_tasks,
              })}
            </span>
          </div>

          <ProgressBar value={progress.task_progress_percent} />

          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            {t("completedPercent", {
              percent: progress.task_progress_percent,
            })}
          </p>
        </div>
      </div>
    </section>
  );
}
