import { Link } from "@/i18n/navigation";
import { NativeTaskRiskRefreshButton } from "@/features/native-task-risk/components/native-task-risk-refresh-button";
import type {
  NativeTaskRiskAlert,
  NativeTaskRiskBand,
} from "@/features/native-task-risk/native-task-risk.types";
import { NativeTaskRiskActionButtons } from "./native-task-risk-action-buttons";

type NativeTaskRiskAlertsCardProps = {
  alerts: NativeTaskRiskAlert[];
};

function bandClass(band: NativeTaskRiskBand) {
  if (band === "high") {
    return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  }

  if (band === "elevated") {
    return "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300";
  }

  if (band === "moderate") {
    return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  }

  return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
}

function bandLabel(band: NativeTaskRiskBand) {
  if (band === "high") return "High risk";
  if (band === "elevated") return "Elevated";
  if (band === "moderate") return "Moderate";
  return "Low risk";
}

function formatPercent(value: number) {
  return `${Math.round(Number(value) * 100)}%`;
}

// function reasonText(featureName: string) {
//   const labels: Record<string, string> = {
//     days_until_due: "Deadline is close",
//     task_age_days: "Task has been open for a while",
//     estimated_minutes: "Estimated workload is high",
//     priority: "Priority increases pressure",
//     focus_minutes_last_7d: "Recent focus time affects risk",
//     completed_tasks_last_7d: "Recent completion pattern affects risk",
//     overdue_tasks_last_30d: "Recent overdue history affects risk",
//     goal_completion_ratio: "Goal progress affects risk",
//     is_subtask: "Subtask structure affects risk",
//     task_depth: "Task hierarchy affects risk",
//     child_task_count: "Child task count affects risk",
//   };

//   return labels[featureName] ?? featureName;
// }

export function NativeTaskRiskAlertsCard({
  alerts,
}: NativeTaskRiskAlertsCardProps) {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Native ML
          </p>

          <h2 className="mt-2 text-2xl font-bold text-neutral-950 dark:text-neutral-50">
            Task delay risk alerts
          </h2>

          <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
            Lumivox uses your own task, goal and focus-session data to estimate
            which upcoming tasks may need attention.
          </p>
        </div>

        <NativeTaskRiskRefreshButton />
      </div>

      {alerts.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center dark:border-neutral-800">
          <h3 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
            No task risk alerts yet
          </h3>

          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Refresh risk predictions to check upcoming tasks with deadlines.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {alerts.map((alert) => (
            <article
              key={alert.prediction_id}
              className="rounded-2xl border p-4 dark:border-neutral-800"
            >
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${bandClass(
                        alert.risk_band,
                      )}`}
                    >
                      {bandLabel(alert.risk_band)}
                    </span>

                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                      {formatPercent(alert.risk_probability)}
                    </span>

                    {alert.days_until_due !== null ? (
                      <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                        {alert.days_until_due} day(s) left
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-3 text-lg font-bold text-neutral-950 dark:text-neutral-50">
                    {alert.task_title}
                  </h3>

                  {alert.goal_title ? (
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                      Goal: {alert.goal_title}
                    </p>
                  ) : null}

                  <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                    Model: {alert.algorithm} · {alert.model_version}
                  </p>
                </div>

                <Link
                  href={`/tasks`}
                  className="rounded-xl border px-4 py-2.5 text-sm font-medium transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                >
                  View task
                </Link>
              </div>

              {alert.reason_summaries?.length > 0 ? (
                <div className="mt-4 rounded-xl bg-neutral-50 p-4 dark:bg-neutral-900">
                  <p className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
                    Why this task needs attention
                  </p>

                  <div className="mt-3 space-y-3">
                    {alert.reason_summaries.slice(0, 3).map((reason) => (
                      <div
                        key={`${alert.prediction_id}-${reason.title}`}
                        className="rounded-xl bg-white p-3 dark:bg-neutral-950"
                      >
                        <p className="text-sm font-medium text-neutral-950 dark:text-neutral-50">
                          {reason.title}
                        </p>

                        <p className="mt-1 text-sm leading-6 text-neutral-600 dark:text-neutral-400">
                          {reason.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {alert.recommended_actions?.length > 0 ? (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
                    Recommended actions
                  </p>

                  <NativeTaskRiskActionButtons
                    taskId={alert.task_id}
                    actions={alert.recommended_actions}
                  />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
