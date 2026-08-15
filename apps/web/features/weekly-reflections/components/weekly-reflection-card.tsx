import { useLocale, useTranslations } from "next-intl";

import type {
  WeeklyReflectionAction,
  WeeklyReflectionCardWithReflection,
  WeeklyReflectionMetrics,
  WeeklyReflectionWatchout,
  WeeklyReflectionWin,
} from "@/features/weekly-reflections/weekly-reflection.types";

type WeeklyReflectionCardProps = {
  card: WeeklyReflectionCardWithReflection;
};

function directionBadgeClass(
  direction:
    | "improving"
    | "stable"
    | "mixed"
    | "needs_attention"
    | undefined,
) {
  if (direction === "improving") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (direction === "needs_attention") {
    return "bg-red-100 text-red-800";
  }

  if (direction === "mixed") {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-secondary text-foreground";
}

function formatWindow(value: string | undefined, locale: string) {
  if (!value) return null;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function WeeklyReflectionCard({ card }: WeeklyReflectionCardProps) {
  const locale = useLocale();
  const t = useTranslations("reflections.card");
  const reflection = card.weekly_reflections;

  const currentMetrics =
    (reflection?.current_metrics as WeeklyReflectionMetrics | null) ?? null;

  const wins = (card.wins as WeeklyReflectionWin[] | null) ?? [];
  const watchouts = (card.watchouts as WeeklyReflectionWatchout[] | null) ?? [];
  const actions =
    (card.next_week_actions as WeeklyReflectionAction[] | null) ?? [];

  const direction = reflection?.reflection_direction ?? "unknown";
  const windowStart =
    formatWindow(reflection?.current_window_start, locale) ?? t("unknown");
  const windowEnd =
    formatWindow(reflection?.current_window_end, locale) ?? t("unknown");

  return (
    <article className="rounded-[28px] border border-border/70 bg-card/90 p-5 shadow-[0_18px_60px_-50px_hsl(var(--primary)/0.55)]">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="max-w-4xl space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {t("badge")}
            </span>

            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${directionBadgeClass(
                reflection?.reflection_direction,
              )}`}
            >
              {t(`direction.${direction}`)}
            </span>
          </div>

          <div>
            <h3 className="text-2xl font-semibold tracking-tight text-foreground">
              {card.title}
            </h3>

            <p className="mt-2 text-foreground/75">{card.summary}</p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-secondary/35 p-4">
            <p className="text-sm font-semibold text-muted-foreground">
              {t("reflection")}
            </p>
            <p className="mt-2 text-sm leading-6 text-foreground/75">
              {card.reflection_interpretation}
            </p>
          </div>
        </div>

        <div className="min-w-57.5 rounded-2xl border border-border/70 bg-secondary/35 p-4">
          <p className="text-sm font-semibold text-muted-foreground">
            {t("currentWindow")}
          </p>

          <p className="mt-2 text-sm text-foreground">{windowStart}</p>
          <p className="text-sm text-foreground">{"->"} {windowEnd}</p>

          {currentMetrics ? (
            <div className="mt-4 space-y-2 text-sm text-foreground/80">
              <p>
                {t("metrics.focus")}{" "}
                <span className="font-semibold">
                  {t("metrics.minutes", {
                    count: currentMetrics.completed_focus_minutes,
                  })}
                </span>
              </p>
              <p>
                {t("metrics.tasksDone")}{" "}
                <span className="font-semibold">
                  {currentMetrics.completed_tasks}
                </span>
              </p>
              <p>
                {t("metrics.activeDays")}{" "}
                <span className="font-semibold">
                  {currentMetrics.active_focus_days}
                </span>
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <MiniSummary label={t("wins")} value={wins.length} tone="emerald" />
        <MiniSummary
          label={t("watchouts")}
          value={watchouts.length}
          tone="amber"
        />
        <MiniSummary label={t("actions")} value={actions.length} tone="primary" />
      </div>

      <details className="group mt-5 rounded-2xl border border-border/70 bg-secondary/20 p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 outline-none">
          <div>
            <h4 className="text-lg font-semibold text-foreground">
              {t("detailsTitle")}
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("detailsDescription")}
            </p>
          </div>

          <span className="rounded-full border border-border/70 bg-card/90 px-3 py-1 text-xs font-semibold text-muted-foreground transition group-open:bg-primary group-open:text-primary-foreground">
            {t("toggle")}
          </span>
        </summary>

        <div className="mt-4 space-y-4">
          <ReflectionList
            title={t("wins")}
            empty={t("emptyWins")}
            items={wins.map((item) => ({
              key: item.evidence_key,
              body: item.student_friendly_explanation,
            }))}
          />

          <ReflectionList
            title={t("watchouts")}
            empty={t("emptyWatchouts")}
            items={watchouts.map((item) => ({
              key: item.evidence_key,
              body: item.student_friendly_explanation,
            }))}
          />

          <ReflectionList
            title={t("nextWeekActions")}
            empty={t("emptyActions")}
            items={actions.map((item) => ({
              key: item.action,
              body: item.rationale,
            }))}
          />
        </div>
      </details>

      <div className="mt-5 rounded-2xl border border-dashed border-border/70 p-4">
        <p className="text-sm font-semibold text-foreground">
          {t("confidenceNote")}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {card.confidence_note}
        </p>
      </div>
    </article>
  );
}

type MiniSummaryProps = {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "primary";
};

function MiniSummary({ label, value, tone }: MiniSummaryProps) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "amber"
        ? "bg-amber-100 text-amber-800"
        : "bg-primary/10 text-primary";

  return (
    <div className="rounded-2xl border border-border/70 bg-secondary/25 p-4">
      <p
        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass}`}
      >
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

type ReflectionListProps = {
  title: string;
  empty: string;
  items: Array<{
    key: string;
    body: string;
  }>;
};

function ReflectionList({ title, empty, items }: ReflectionListProps) {
  return (
    <section className="rounded-3xl border border-border/70 bg-card/90 p-4">
      <h4 className="text-lg font-semibold text-foreground">{title}</h4>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {items.length === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">{empty}</p>
        ) : (
          items.map((item) => (
            <div
              key={item.key}
              className="rounded-xl border border-border/70 bg-secondary/25 p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">
                {item.key.replaceAll("_", " ")}
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground/75">
                {item.body}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
