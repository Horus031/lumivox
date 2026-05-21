import type {
  NativeTaskAiInsightCardWithAssessment,
  NativeTaskInsightEvidenceItem,
  NativeTaskInsightRecommendedAction,
} from "@/features/native-task-insights/native-task-insight.types";

type NativeTaskAiInsightCardProps = {
  card: NativeTaskAiInsightCardWithAssessment;
};

function getRiskBadgeClass(
  band: "low" | "moderate" | "elevated" | "high" | undefined,
) {
  if (band === "high") {
    return "bg-red-100 text-red-800";
  }

  if (band === "elevated") {
    return "bg-amber-100 text-amber-800";
  }

  if (band === "moderate") {
    return "bg-yellow-100 text-yellow-800";
  }

  return "bg-emerald-100 text-emerald-800";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No due date";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function NativeTaskAiInsightCard({
  card,
}: NativeTaskAiInsightCardProps) {
  const assessment = card.native_task_risk_assessments;
  const task = assessment?.tasks;

  const evidence =
    (card.evidence as NativeTaskInsightEvidenceItem[] | null) ?? [];

  const recommendedActions =
    (card.recommended_actions as NativeTaskInsightRecommendedAction[] | null) ??
    [];

  return (
    <article className="rounded-[28px] border border-border/70 bg-card/90 p-6 shadow-[0_18px_60px_-50px_hsl(var(--primary)/0.55)]">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="max-w-4xl">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Native AI Insight
            </span>

            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getRiskBadgeClass(
                assessment?.risk_band,
              )}`}
            >
              {assessment?.risk_band ?? "unknown"} risk
            </span>
          </div>

          <h3 className="text-2xl font-semibold tracking-tight text-foreground">{card.title}</h3>

          <p className="mt-3 text-foreground/75">{card.summary}</p>

          <div className="mt-4 rounded-2xl border border-border/70 bg-secondary/35 p-4">
            <p className="text-sm font-semibold text-muted-foreground">
              Interpretation
            </p>
            <p className="mt-2 text-sm leading-6 text-foreground/75">
              {card.risk_interpretation}
            </p>
          </div>
        </div>

        <div className="min-w-[220px] rounded-2xl border border-border/70 bg-secondary/35 p-4">
          <p className="text-sm font-medium text-muted-foreground">Related task</p>

          <p className="mt-2 font-semibold text-foreground">{task?.title ?? "Unknown task"}</p>

          <p className="mt-2 text-sm text-muted-foreground">
            Due: {formatDate(task?.due_at)}
          </p>

          <p className="mt-1 text-sm capitalize text-muted-foreground">
            Priority: {task?.priority ?? "unknown"}
          </p>

          <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {assessment ? Number(assessment.risk_score).toFixed(1) : "N/A"}
          </p>

          <p className="text-xs text-muted-foreground">Native risk score / 100</p>
        </div>
      </div>

      <details className="group mt-6 rounded-[24px] border border-border/70 bg-secondary/20 p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 outline-none">
          <div>
            <h4 className="text-lg font-semibold text-foreground">
              Evidence and actions
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Task-specific evidence and recommended next steps.
            </p>
          </div>

          <span className="rounded-full border border-border/70 bg-card/90 px-3 py-1 text-xs font-semibold text-muted-foreground transition group-open:bg-primary group-open:text-primary-foreground">
            Toggle
          </span>
        </summary>

        <div className="mt-4 grid gap-5 xl:grid-cols-2">
          <section className="rounded-[24px] border border-border/70 bg-card/90 p-5">
            <h4 className="text-lg font-semibold text-foreground">Evidence</h4>

            <div className="mt-4 space-y-3">
              {evidence.map((item) => (
                <div
                  key={`${item.evidence_key}-${item.student_friendly_explanation}`}
                  className="rounded-xl border border-border/70 bg-secondary/25 p-4"
                >
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground">
                    {item.evidence_key}
                  </span>

                  <p className="mt-3 text-sm leading-6 text-foreground/75">
                    {item.student_friendly_explanation}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-border/70 bg-card/90 p-5">
            <h4 className="text-lg font-semibold text-foreground">Recommended actions</h4>

            <div className="mt-4 space-y-3">
              {recommendedActions.map((item) => (
                <div key={item.action} className="rounded-xl border border-border/70 bg-secondary/25 p-4">
                  <p className="font-medium text-foreground">{item.action}</p>
                  <p className="mt-2 text-sm leading-6 text-foreground/75">
                    {item.rationale}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </details>

      <div className="mt-6 rounded-2xl border border-dashed border-border/70 p-4">
        <p className="text-sm font-semibold text-foreground">
          Confidence note
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {card.confidence_note}
        </p>
      </div>

      <footer className="mt-5 flex flex-col justify-between gap-2 border-t border-border/70 pt-4 text-xs text-muted-foreground md:flex-row md:items-center">
        <p>
          LLM: {card.llm_provider} / {card.llm_model}
        </p>

        <p>
          Prompt: {card.prompt_version} · Schema:{" "}
          {card.structured_output_schema_version}
        </p>
      </footer>
    </article>
  );
}
