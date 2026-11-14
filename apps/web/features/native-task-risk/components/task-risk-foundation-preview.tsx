
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import {
  TASK_RISK_UI_ACTIONS,
  TASK_RISK_UI_FIXTURES,
  type TaskRiskFixtureKey,
} from "../task-risk-ui.fixtures";

import type {
  TaskRiskRecoveryActionType,
} from "../task-risk-presentation.types";

import { TaskRiskIndicator } from "./task-risk-indicator";
import { TaskRiskRecoveryPanel } from "./task-risk-recovery-panel";
import { TaskRiskSummary } from "./task-risk-summary";

export function TaskRiskFoundationPreview() {
  const t = useTranslations("taskRiskRecovery");

  const [selectedId, setSelectedId] =
    useState<TaskRiskFixtureKey>("high");

  const [selectedAction, setSelectedAction] =
    useState<TaskRiskRecoveryActionType | null>(null);

  const selectedFixture =
    TASK_RISK_UI_FIXTURES.find(
      (fixture) => fixture.id === selectedId,
    ) ?? TASK_RISK_UI_FIXTURES[0];

  function selectFixture(id: TaskRiskFixtureKey) {
    setSelectedId(id);
    setSelectedAction(null);
  }

  return (
    <section className="min-w-0 space-y-section">
      <header className="space-y-2">
        <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
          {t("preview.eyebrow")}
        </p>

        <h1 className="text-page font-semibold text-foreground">
          {t("preview.title")}
        </h1>

        <p className="max-w-3xl text-body text-secondary-text">
          {t("preview.description")}
        </p>
      </header>

      <div className="rounded-lg border border-border bg-muted/40 p-card">
        <p className="text-body text-secondary-text">
          {t("preview.disclaimer")}
        </p>
      </div>

      <div className="grid gap-card lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="min-w-0 space-y-3">
          <h2 className="text-section font-semibold text-foreground">
            {t("preview.scenarios")}
          </h2>

          {TASK_RISK_UI_FIXTURES.map((fixture) => (
            <button
              key={fixture.id}
              type="button"
              aria-pressed={selectedId === fixture.id}
              onClick={() => selectFixture(fixture.id)}
              data-risk-fixture={fixture.id}
              className={
                "flex min-h-touch w-full flex-wrap items-center " +
                "justify-between gap-3 rounded-lg border bg-card " +
                "p-3 text-left transition-colors " +
                "hover:border-ring/40 focus-visible:outline-none " +
                "focus-visible:ring-2 focus-visible:ring-ring " +
                (selectedId === fixture.id
                  ? "border-ring"
                  : "border-border")
              }
            >
              <span className="text-body font-medium text-foreground">
                {t(`preview.cases.${fixture.id}`)}
              </span>

              <TaskRiskIndicator state={fixture.state} />
            </button>
          ))}
        </div>

        <div className="min-w-0 space-y-card">
          <h2 className="text-section font-semibold text-foreground">
            {t("preview.details")}
          </h2>

          <TaskRiskSummary state={selectedFixture.state} />

          <TaskRiskRecoveryPanel
            state={selectedFixture.state}
            actions={TASK_RISK_UI_ACTIONS}
            onActionRequested={(action) =>
              setSelectedAction(action.type)
            }
          />

          {selectedAction ? (
            <p
              role="status"
              className="rounded-lg border border-border bg-muted p-3 text-body text-secondary-text"
            >
              {t("preview.actionSelected", {
                action: t(
                  `actions.label.${selectedAction}`,
                ),
              })}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
