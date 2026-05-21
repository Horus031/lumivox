import type { PbiExplanationPayload } from "@/features/pbi/pbi.types";

type PbiExplanationPanelProps = {
  explanation: PbiExplanationPayload | null;
};

function scoreToPercent(score: number) {
  return `${Math.round(score * 100)}%`;
}

function getInsightBadgeClass(type: "positive" | "warning" | "neutral") {
  if (type === "positive") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (type === "warning") {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-secondary text-foreground";
}

function getComponentLevelClass(level: "low" | "moderate" | "strong") {
  if (level === "strong") {
    return "text-emerald-700";
  }

  if (level === "moderate") {
    return "text-amber-700";
  }

  return "text-red-700";
}

export function PbiExplanationPanel({ explanation }: PbiExplanationPanelProps) {
  if (!explanation) {
    return (
      <section className="rounded-[28px] border border-dashed border-border/70 bg-card/80 p-8 text-center">
        <h2 className="text-xl font-semibold text-foreground">
          No behavioural explanation yet
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Generate a PBI snapshot to view an interpretable breakdown of your
          behaviour.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 gap-4">
      <article className="rounded-[28px] w-full border border-border/70 bg-card/90 p-5 shadow-[0_18px_60px_-45px_hsl(var(--primary)/0.55)]">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-primary/70">
              PBI interpretation
            </p>

            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              {explanation.pbi_band}
            </h2>

            <p className="mt-3 max-w-4xl text-foreground/80">
              {explanation.overall_summary}
            </p>
          </div>

          {/* <div className="rounded-2xl border border-border/70 bg-secondary/40 px-5 py-4">
            <p className="text-sm font-medium text-muted-foreground">
              Explanation layer
            </p>
            <p className="mt-1 font-semibold text-foreground">
              {explanation.explanation_version}
            </p>
          </div> */}
        </div>
      </article>

      <div className="flex gap-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {explanation.actionable_insights.map((insight) => (
            <article
              key={`${insight.linked_component}-${insight.title}`}
              className=" border border-border/70 rounded-lg bg-card/90 p-4 shadow-sm"
            >
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${getInsightBadgeClass(
                  insight.type,
                )}`}
              >
                {insight.type}
              </span>

              <h3 className="mt-3 text-lg font-semibold text-foreground">
                {insight.title}
              </h3>

              <p className="mt-2 text-sm leading-6 text-foreground/75">
                {insight.body}
              </p>
            </article>
          ))}
        </div>

        <article className="rounded-[28px] w-full border border-border/70 bg-card/90 p-4 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-1 py-1 outline-none">
            <div>
              <h3 className="text-xl font-semibold text-foreground">
                Component-level explanations
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Each PBI dimension is explained using the rule-based
                interpretation layer.
              </p>
            </div>
          </summary>

          <div className="mt-4 space-y-4">
            {explanation.component_explanations.map((component) => (
              <div
                key={component.key}
                className="rounded-2xl border border-border/70 bg-secondary/25 p-4"
              >
                <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
                  <div>
                    <h4 className="font-semibold text-foreground">
                      {component.title}
                    </h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {component.message}
                    </p>
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-2xl font-semibold text-foreground">
                      {scoreToPercent(component.score)}
                    </p>
                    <p
                      className={`text-sm font-semibold capitalize ${getComponentLevelClass(
                        component.level,
                      )}`}
                    >
                      {component.level}
                    </p>
                  </div>
                </div>

                {/* <div className="mt-4 h-2 overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary via-teal-500 to-amber-400"
                      style={{ width: `${component.score * 100}%`, background: `linear-gradient(red, yellow)` }}
                    />
                  </div> */}
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
