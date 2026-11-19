import { useLocale, useTranslations } from "next-intl";

import { TaskRiskIndicator } from "./task-risk-indicator";
import type { TaskRiskViewState } from "../task-risk-presentation.types";

type TaskRiskSummaryProps = {
  state: TaskRiskViewState;
};

export function TaskRiskSummary({ state }: TaskRiskSummaryProps) {
  const t = useTranslations("taskRiskRecovery");
  const locale = useLocale();

  if (state.status !== "ready") {
    const message =
      state.status === "loading"
        ? t("summary.loading")
        : state.status === "stale"
          ? t("summary.stale")
          : state.status === "ineligible"
            ? t("summary.ineligible")
            : t("summary.unavailable");

    return (
      <section
        data-risk-view-state={state.status}
        aria-label={t("summary.title")}
        className="min-w-0 rounded-lg border border-border bg-card p-card"
      >
        <h3 className="text-section font-semibold text-foreground">{t("summary.title")}</h3>

        <p role="status" className="mt-2 text-body text-secondary-text">
          {message}
        </p>
      </section>
    );
  }

  const { alert } = state;

  const probabilityIsValid =
    Number.isFinite(alert.risk_probability) &&
    alert.risk_probability >= 0 &&
    alert.risk_probability <= 1;

  const probability = probabilityIsValid ? Math.round(alert.risk_probability * 100) : null;

  const predictionDate = new Date(alert.predicted_at);

  const predictionDateLabel = Number.isNaN(predictionDate.getTime())
    ? null
    : `${new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(predictionDate)} UTC`;

  const reasons = alert.reason_summaries.slice(0, 3);

  return (
    <section
      data-risk-view-state="ready"
      aria-label={t("summary.title")}
      className="min-w-0 rounded-lg border border-border bg-card p-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-section font-semibold text-foreground">{t("summary.title")}</h3>

          <p className="mt-1 text-caption text-muted-foreground">{t("summary.subtitle")}</p>
        </div>

        {alert.risk_band === "low" ? (
          <span className="rounded-md border border-border bg-muted px-2 py-1 text-caption font-medium text-secondary-text">
            {t("status.low")}
          </span>
        ) : (
          <TaskRiskIndicator state={state} />
        )}
      </div>

      {probability !== null ? (
        <div className="mt-4">
          <p className="text-caption text-muted-foreground">{t("summary.estimateLabel")}</p>

          <p className="mt-1 text-metric font-semibold tabular-nums text-foreground">
            {probability}%
          </p>
        </div>
      ) : (
        <p className="mt-4 text-body text-secondary-text">{t("summary.invalidEstimate")}</p>
      )}

      <p className="mt-2 text-body text-secondary-text">{t("summary.disclaimer")}</p>

      <div className="mt-3 flex flex-wrap gap-3 text-caption text-muted-foreground">
        {alert.days_until_due !== null && alert.days_until_due >= 0 ? (
          <span>
            {t("summary.daysRemaining", {
              days: alert.days_until_due,
            })}
          </span>
        ) : null}

        {predictionDateLabel ? (
          <span>
            {t("summary.updated", {
              date: predictionDateLabel,
            })}
          </span>
        ) : null}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <h4 className="text-label font-semibold text-foreground">{t("summary.reasonsTitle")}</h4>

        {reasons.length === 0 ? (
          <p className="mt-2 text-body text-muted-foreground">{t("summary.noReasons")}</p>
        ) : (
          <div className="mt-3 space-y-3">
            {reasons.map((reason, index) => (
              <div
                key={`${index}-${reason.title}`}
                className="rounded-lg border border-border bg-muted/40 p-3"
              >
                <p className="text-body font-medium text-foreground">{reason.title}</p>

                <p className="mt-1 text-body text-secondary-text">{reason.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
