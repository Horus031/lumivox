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

function formatWindow(value: string | undefined) {
  if (!value) return "Unknown";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function WeeklyReflectionCard({
  card,
}: WeeklyReflectionCardProps) {
  const reflection = card.weekly_reflections;

  const currentMetrics =
    (reflection?.current_metrics as WeeklyReflectionMetrics | null) ?? null;

  const wins = (card.wins as WeeklyReflectionWin[] | null) ?? [];
  const watchouts = (card.watchouts as WeeklyReflectionWatchout[] | null) ?? [];
  const actions = (card.next_week_actions as WeeklyReflectionAction[] | null) ?? [];

  return (
    <article className="rounded-[28px] border border-border/70 bg-card/90 p-5 shadow-[0_18px_60px_-50px_hsl(var(--primary)/0.55)]">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="max-w-4xl space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Weekly Reflection
            </span>

            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${directionBadgeClass(
                reflection?.reflection_direction,
              )}`}
            >
              {reflection?.reflection_direction?.replace("_", " ") ?? "unknown"}
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
              Reflection
            </p>
            <p className="mt-2 text-sm leading-6 text-foreground/75">
              {card.reflection_interpretation}
            </p>
          </div>
        </div>

        <div className="min-w-[230px] rounded-2xl border border-border/70 bg-secondary/35 p-4">
          <p className="text-sm font-semibold text-muted-foreground">
            Current window
          </p>

          <p className="mt-2 text-sm text-foreground">
            {formatWindow(reflection?.current_window_start)}
          </p>
          <p className="text-sm text-foreground">
            → {formatWindow(reflection?.current_window_end)}
          </p>

          {currentMetrics ? (
            <div className="mt-4 space-y-2 text-sm text-foreground/80">
              <p>
                Focus: <span className="font-semibold">{currentMetrics.completed_focus_minutes} min</span>
              </p>
              <p>
                Tasks done: <span className="font-semibold">{currentMetrics.completed_tasks}</span>
              </p>
              <p>
                Active days: <span className="font-semibold">{currentMetrics.active_focus_days}</span>
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <MiniSummary label="Wins" value={wins.length} tone="emerald" />
        <MiniSummary label="Watchouts" value={watchouts.length} tone="amber" />
        <MiniSummary label="Actions" value={actions.length} tone="primary" />
      </div>

      <details className="group mt-5 rounded-2xl border border-border/70 bg-secondary/20 p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 outline-none">
          <div>
            <h4 className="text-lg font-semibold text-foreground">
              Reflection details
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Wins, watchouts, and next-week actions.
            </p>
          </div>

          <span className="rounded-full border border-border/70 bg-card/90 px-3 py-1 text-xs font-semibold text-muted-foreground transition group-open:bg-primary group-open:text-primary-foreground">
            Toggle
          </span>
        </summary>

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <ReflectionList
            title="Wins"
            empty="No strong positive signal was detected in this reflection."
            items={wins.map((item) => ({
              key: item.evidence_key,
              body: item.student_friendly_explanation,
            }))}
          />

          <ReflectionList
            title="Watchouts"
            empty="No major watchout was highlighted."
            items={watchouts.map((item) => ({
              key: item.evidence_key,
              body: item.student_friendly_explanation,
            }))}
          />

          <ReflectionList
            title="Next-week actions"
            empty="No action items were generated."
            items={actions.map((item) => ({
              key: item.action,
              body: item.rationale,
            }))}
          />
        </div>
      </details>

      <div className="mt-5 rounded-2xl border border-dashed border-border/70 p-4">
        <p className="text-sm font-semibold text-foreground">
          Confidence note
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {card.confidence_note}
        </p>
      </div>

      {/* <footer className="mt-5 flex flex-col justify-between gap-2 border-t border-border/70 pt-4 text-xs text-muted-foreground md:flex-row md:items-center">
        <p>
          LLM: {card.llm_provider} / {card.llm_model}
        </p>

        <p>
          Prompt: {card.prompt_version} · Schema: {card.structured_output_schema_version}
        </p>
      </footer> */}
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
      <p className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
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

function ReflectionList({
  title,
  empty,
  items,
}: ReflectionListProps) {
  return (
    <section className="rounded-[24px] border border-border/70 bg-card/90 p-4">
      <h4 className="text-lg font-semibold text-foreground">{title}</h4>

      <div className="mt-4 space-y-3">
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