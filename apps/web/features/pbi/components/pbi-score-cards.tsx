import { useLocale, useTranslations } from "next-intl";

import type {
  PbiComponentExplanation,
  PbiExplanationPayload,
} from "@/features/pbi/pbi.types";

type PbiSnapshot = {
  standard_pbi: number;
  personalized_pbi: number;
  task_completion_rate: number;
  focus_quality_score: number;
  deadline_adherence_score: number;
  goal_momentum_score: number;
  consistency_score: number;
  period_start: string;
  period_end: string;
};

type PbiScoreCardsProps = {
  snapshot: PbiSnapshot | null;
  explanation?: PbiExplanationPayload | null;
};

function getScoreLevel(score: number): PbiComponentExplanation["level"] {
  if (score >= 0.7) return "strong";
  if (score >= 0.4) return "moderate";
  return "low";
}

export function PbiScoreCards({ snapshot, explanation }: PbiScoreCardsProps) {
  const t = useTranslations("dashboard.pbiScore");
  const explanationT = useTranslations("dashboard.pbiExplanation");
  const locale = useLocale();
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

  if (!snapshot) {
    return (
      <section className="flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-section font-semibold">{t("emptyTitle")}</h2>
        <p className="mt-1 text-body text-secondary-text">{t("emptyDescription")}</p>
      </section>
    );
  }

  const fallbackComponents: PbiComponentExplanation[] = [
    { key: "task_completion", title: t("components.taskCompletion"), score: snapshot.task_completion_rate },
    { key: "focus_quality", title: t("components.focusQuality"), score: snapshot.focus_quality_score },
    { key: "deadline_adherence", title: t("components.deadlineAdherence"), score: snapshot.deadline_adherence_score },
    { key: "goal_momentum", title: t("components.goalMomentum"), score: snapshot.goal_momentum_score },
    { key: "consistency", title: t("components.consistency"), score: snapshot.consistency_score },
  ].map((component) => ({ ...component, level: getScoreLevel(component.score), message: "" }));
  const components = explanation?.component_explanations?.length
    ? explanation.component_explanations
    : fallbackComponents;

  return (
    <section className="flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-card border-b border-border pb-card">
        {[{ key: "personalized", score: snapshot.personalized_pbi }, { key: "standard", score: snapshot.standard_pbi }].map((metric) => (
          <div key={metric.key} className="min-w-0">
            <h2 className="text-label font-medium text-secondary-text">{t(`${metric.key}.title`)}</h2>
            <p className="mt-1 text-metric font-semibold tabular-nums [overflow-wrap:anywhere]">
              {formatter.format(metric.score)} <span className="text-caption font-normal text-muted-foreground">/ 100</span>
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-caption text-muted-foreground [overflow-wrap:anywhere]">
        {t("period", { start: snapshot.period_start, end: snapshot.period_end })}
      </p>
      <h3 className="mt-4 text-label font-medium">{explanationT("componentTitle")}</h3>
      <div className="mt-3 flex flex-1 flex-col justify-between gap-3">
        {components.map((component) => {
          const score = Math.min(100, Math.max(0, component.score * 100));
          const levelLabel = explanationT(`levels.${component.level}`);
          return (
            <div key={component.key} className="min-w-0" title={component.message || undefined}>
              <div className="mb-1.5 flex items-start justify-between gap-3 text-label">
                <span className="min-w-0 [overflow-wrap:anywhere]">{component.title}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-caption text-muted-foreground">{levelLabel}</span>
                  <span className="font-medium tabular-nums">{formatter.format(score)}%</span>
                </span>
              </div>
              <div role="meter" aria-label={component.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}
                aria-valuetext={`${formatter.format(score)}% - ${levelLabel}`}
                className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary dark:bg-success" style={{ width: `${score}%` }} />
              </div>
              {component.message ? <p className="sr-only">{component.message}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
