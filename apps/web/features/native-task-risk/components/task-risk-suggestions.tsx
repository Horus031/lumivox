import { useTranslations } from "next-intl";

import type { TaskRiskViewState } from "../task-risk-presentation.types";

type TaskRiskSuggestionsProps = {
  state: TaskRiskViewState;
};

export function TaskRiskSuggestions({ state }: TaskRiskSuggestionsProps) {
  const t = useTranslations("taskRiskRecovery");

  if (state.status !== "ready" || state.alert.risk_band === "low") {
    return null;
  }

  const suggestions = [
    ...new Set(
      state.alert.recommended_actions
        .map((action) => action.action_type)
        .filter((type) => type !== "view_task"),
    ),
  ];

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <section
      aria-label={t("actions.title")}
      className="min-w-0 rounded-lg border border-border bg-card p-card"
    >
      <h3 className="text-section font-semibold text-foreground">
        {t("actions.title")}
      </h3>

      <p className="mt-2 text-body text-secondary-text">
        {t("actions.readOnlyNotice")}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {suggestions.map((type) => (
          <article
            key={type}
            className="rounded-lg border border-border bg-muted/30 p-3"
          >
            <h4 className="text-label font-semibold text-foreground">
              {t(`actions.label.${type}`)}
            </h4>

            <p className="mt-1 text-body text-secondary-text">
              {t(`actions.description.${type}`)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
