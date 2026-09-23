import { Activity } from "lucide-react";
import { useTranslations } from "next-intl";

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

const GAUGE_RADIUS = 62;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
const GAUGE_ARC_RATIO = 0.76;

function formatScore(score: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(score);
}

function PbiScoreGauge({ score, label }: { score: number; label: string }) {
  const normalizedScore = Math.min(100, Math.max(0, score));
  const arcLength = GAUGE_CIRCUMFERENCE * GAUGE_ARC_RATIO;
  const progressLength = arcLength * (normalizedScore / 100);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-44 sm:max-w-48">
      <svg
        aria-label={`${label}: ${formatScore(score)}`}
        className="h-full w-full overflow-visible"
        role="img"
        viewBox="0 0 176 176"
      >
        <defs>
          <linearGradient
            id="pbi-score-gradient"
            x1="20"
            x2="156"
            y1="150"
            y2="24"
          >
            <stop offset="0%" stopColor="#1c806e" />
            <stop offset="52%" stopColor="#20d5a6" />
            <stop offset="100%" stopColor="#5af0c2" />
          </linearGradient>
          <filter
            id="pbi-score-glow"
            height="240%"
            width="240%"
            x="-70%"
            y="-70%"
          >
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        <circle
          cx="88"
          cy="88"
          fill="none"
          r={GAUGE_RADIUS}
          stroke="rgba(118, 164, 149, 0.14)"
          strokeDasharray={`${arcLength} ${GAUGE_CIRCUMFERENCE}`}
          strokeLinecap="round"
          strokeWidth="10"
          transform="rotate(133 88 88)"
        />
        <circle
          cx="88"
          cy="88"
          fill="none"
          filter="url(#pbi-score-glow)"
          opacity="0.32"
          r={GAUGE_RADIUS}
          stroke="#20d5a6"
          strokeDasharray={`${progressLength} ${GAUGE_CIRCUMFERENCE}`}
          strokeLinecap="round"
          strokeWidth="13"
          transform="rotate(133 88 88)"
        />
        <circle
          cx="88"
          cy="88"
          fill="none"
          r={GAUGE_RADIUS}
          stroke="url(#pbi-score-gradient)"
          strokeDasharray={`${progressLength} ${GAUGE_CIRCUMFERENCE}`}
          strokeLinecap="round"
          strokeWidth="9"
          transform="rotate(133 88 88)"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center pt-1 text-center">
        <span className="max-w-24 text-[11px] font-medium leading-tight text-muted-foreground">
          {label}
        </span>
        <strong className="mt-1 text-[2.5rem] font-semibold leading-none text-foreground tabular-nums">
          {formatScore(score)}
        </strong>
        <span className="mt-1 text-[11px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

const COMPONENT_COLORS = [
  "#38bdf8",
  "#f59e0b",
  "#f472b6",
  "#a3e635",
  "#22d3ee",
];

function getScoreLevel(score: number): PbiComponentExplanation["level"] {
  if (score >= 0.7) {
    return "strong";
  }

  if (score >= 0.4) {
    return "moderate";
  }

  return "low";
}

function ComponentScoreGauge({
  component,
  color,
  levelLabel,
}: {
  component: PbiComponentExplanation;
  color: string;
  levelLabel: string;
}) {
  const score = Math.min(100, Math.max(0, component.score * 100));
  const radius = 31;
  const circumference = 2 * Math.PI * radius;
  const progressLength = circumference * (score / 100);

  return (
    <div
      className="group flex min-w-0 flex-col items-center text-center"
      title={component.message}
    >
      <div className="relative size-[82px] shrink-0">
        <svg
          aria-label={`${component.title}: ${formatScore(score)}%`}
          className="size-full -rotate-90 overflow-visible"
          role="img"
          viewBox="0 0 76 76"
        >
          <circle
            cx="38"
            cy="38"
            fill="none"
            r={radius}
            stroke="currentColor"
            strokeWidth="5"
            className="text-border/60"
          />
          <circle
            cx="38"
            cy="38"
            fill="none"
            opacity="0.28"
            r={radius}
            stroke={color}
            strokeDasharray={`${progressLength} ${circumference}`}
            strokeLinecap="round"
            strokeWidth="9"
            style={{ filter: `drop-shadow(0 0 5px ${color})` }}
          />
          <circle
            cx="38"
            cy="38"
            fill="none"
            r={radius}
            stroke={color}
            strokeDasharray={`${progressLength} ${circumference}`}
            strokeLinecap="round"
            strokeWidth="5"
          />
        </svg>

        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-foreground tabular-nums">
          {Math.round(score)}
        </span>
      </div>

      <h3 className="mt-2 line-clamp-2 min-h-8 text-xs font-semibold leading-4 text-foreground">
        {component.title}
      </h3>
      <p className="mt-0.5 text-[11px] font-medium" style={{ color }}>
        {levelLabel}
      </p>
      <span className="sr-only">{component.message}</span>
    </div>
  );
}

export function PbiScoreCards({
  snapshot,
  explanation,
}: PbiScoreCardsProps) {
  const t = useTranslations("dashboard.pbiScore");
  const explanationT = useTranslations("dashboard.pbiExplanation");

  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-card/80 p-6 text-center">
        <h3 className="text-lg font-semibold text-foreground">
          {t("emptyTitle")}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("emptyDescription")}
        </p>
      </div>
    );
  }

  const fallbackComponents: PbiComponentExplanation[] = [
    {
      key: "task_completion",
      title: t("components.taskCompletion"),
      score: snapshot.task_completion_rate,
      level: getScoreLevel(snapshot.task_completion_rate),
      message: "",
    },
    {
      key: "focus_quality",
      title: t("components.focusQuality"),
      score: snapshot.focus_quality_score,
      level: getScoreLevel(snapshot.focus_quality_score),
      message: "",
    },
    {
      key: "deadline_adherence",
      title: t("components.deadlineAdherence"),
      score: snapshot.deadline_adherence_score,
      level: getScoreLevel(snapshot.deadline_adherence_score),
      message: "",
    },
    {
      key: "goal_momentum",
      title: t("components.goalMomentum"),
      score: snapshot.goal_momentum_score,
      level: getScoreLevel(snapshot.goal_momentum_score),
      message: "",
    },
    {
      key: "consistency",
      title: t("components.consistency"),
      score: snapshot.consistency_score,
      level: getScoreLevel(snapshot.consistency_score),
      message: "",
    },
  ];
  const components = explanation?.component_explanations?.length
    ? explanation.component_explanations
    : fallbackComponents;

  return (
    <section className="relative h-full min-h-40 overflow-hidden rounded-md bg-surface p-4 sm:p-5">
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity
                aria-hidden="true"
                className="size-4 text-foreground"
              />
              <h2 className="text-xl font-semibold text-foreground">
                {t("personalized.title")}
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("period", {
                start: snapshot.period_start,
                end: snapshot.period_end,
              })}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[11px] text-muted-foreground">
              {t("standard.title")}
            </p>
            <p className="text-lg font-semibold leading-tight text-foreground tabular-nums">
              {formatScore(snapshot.standard_pbi)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid flex-1 items-center gap-5 xl:grid-cols-[190px_minmax(0,1fr)]">
          <div className="flex items-center justify-center xl:border-r xl:border-border/60 xl:pr-5">
            <PbiScoreGauge
              label={t("personalized.title")}
              score={snapshot.personalized_pbi}
            />
          </div>

          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {explanationT("componentTitle")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {explanationT("componentDescription")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
              {components.map((component, index) => (
                <ComponentScoreGauge
                  color={COMPONENT_COLORS[index % COMPONENT_COLORS.length]}
                  component={component}
                  key={component.key}
                  levelLabel={explanationT(`levels.${component.level}`)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
