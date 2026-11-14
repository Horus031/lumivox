
"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type {
  TaskRiskRecoveryUiAction,
  TaskRiskViewState,
} from "../task-risk-presentation.types";

type TaskRiskRecoveryPanelProps = {
  state: TaskRiskViewState;
  actions: readonly TaskRiskRecoveryUiAction[];
  onActionRequested?: (action: TaskRiskRecoveryUiAction) => void;
};

export function TaskRiskRecoveryPanel({
  state,
  actions,
  onActionRequested,
}: TaskRiskRecoveryPanelProps) {
  const t = useTranslations("taskRiskRecovery");

  if (
    state.status !== "ready" ||
    state.alert.risk_band === "low"
  ) {
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

      <p className="mt-1 text-body text-secondary-text">
        {t("actions.subtitle")}
      </p>

      {actions.length === 0 ? (
        <p className="mt-4 text-body text-muted-foreground">
          {t("actions.empty")}
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {actions.map((action) => (
            <article
              key={action.id}
              className="flex min-w-0 flex-col rounded-lg border border-border bg-muted/30 p-3"
            >
              <h4 className="text-label font-semibold text-foreground">
                {t(`actions.label.${action.type}`)}
              </h4>

              <p className="mt-1 flex-1 text-body text-secondary-text">
                {t(`actions.description.${action.type}`)}
              </p>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full whitespace-normal"
                data-risk-action={action.type}
                disabled={!action.enabled || !onActionRequested}
                onClick={() => onActionRequested?.(action)}
              >
                {t("actions.choose")}
              </Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
