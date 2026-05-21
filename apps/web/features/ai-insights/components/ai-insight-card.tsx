import type {
  AiInsightCardWithPrediction,
  AiInsightEvidenceItem,
  AiInsightRecommendedAction,
} from "@/features/ai-insights/ai-insight.types";

type AiInsightCardProps = {
  card: AiInsightCardWithPrediction;
};

function formatRiskProbability(probability: number | undefined) {
  if (probability === undefined) return "N/A";

  return `${Math.round(probability * 100)}%`;
}

function getRiskLabel(probability: number | undefined) {
  if (probability === undefined) return "Unknown";

  if (probability >= 0.75) return "High risk";
  if (probability >= 0.5) return "Moderate risk";
  return "Lower risk";
}

function getRiskBadgeClass(probability: number | undefined) {
  if (probability === undefined) {
    return "bg-secondary text-foreground";
  }

  if (probability >= 0.75) {
    return "bg-red-100 text-red-800";
  }

  if (probability >= 0.5) {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-emerald-100 text-emerald-800";
}

function getDirectionBadgeClass(
  direction: "increases_risk" | "decreases_risk",
) {
  if (direction === "increases_risk") {
    return "bg-red-100 text-red-800";
  }

  return "bg-emerald-100 text-emerald-800";
}

export function AiInsightCard({ card }: AiInsightCardProps) {
  const prediction = card.deadline_risk_predictions;

  const evidence = (card.evidence as AiInsightEvidenceItem[] | null) ?? [];

  const recommendedActions =
    (card.recommended_actions as AiInsightRecommendedAction[] | null) ?? [];

  const riskProbability = prediction
    ? Number(prediction.risk_probability)
    : undefined;

  return (
    <article className="rounded-[28px] border border-border/70 bg-card/90 p-6 shadow-[0_18px_60px_-50px_hsl(var(--primary)/0.55)]">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="max-w-4xl">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              AI Risk Insight
            </span>

            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${getRiskBadgeClass(
                riskProbability,
              )}`}
            >
              {getRiskLabel(riskProbability)}
            </span>

            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
              Research demo
            </span>
          </div>

          <h3 className="text-2xl font-semibold tracking-tight text-foreground">
            {card.title}
          </h3>

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

        <div className="min-w-[180px] rounded-2xl border border-border/70 bg-secondary/35 p-4">
          <p className="text-sm font-medium text-muted-foreground">
            Predicted risk
          </p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
            {formatRiskProbability(riskProbability)}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            OULAD-compatible deployed research model.
          </p>
        </div>
      </div>

      <details className="group mt-6 rounded-[24px] border border-border/70 bg-secondary/20 p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 outline-none">
          <div>
            <h4 className="text-lg font-semibold text-foreground">
              Evidence and actions
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              SHAP contributors and suggested next steps are kept here to keep the card compact.
            </p>
          </div>

          <span className="rounded-full border border-border/70 bg-card/90 px-3 py-1 text-xs font-semibold text-muted-foreground transition group-open:bg-primary group-open:text-primary-foreground">
            Toggle
          </span>
        </summary>

        <div className="mt-4 grid gap-5 xl:grid-cols-2">
          <section className="rounded-[24px] border border-border/70 bg-card/90 p-5">
            <h4 className="text-lg font-semibold text-foreground">Evidence</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              These explanations are grounded in SHAP contributors used by the prediction pipeline.
            </p>

            <div className="mt-4 space-y-3">
              {evidence.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No evidence items stored.
                </p>
              ) : (
                evidence.map((item, index) => (
                  <div
                    key={`${item.feature ?? "feature"}-${item.direction ?? "direction"}-${index}`}
                    className="rounded-xl border border-border/70 bg-secondary/25 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground">
                        {item.feature ?? "Evidence"}
                      </span>

                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getDirectionBadgeClass(
                          item.direction ?? "decreases_risk",
                        )}`}
                      >
                        {item.direction?.replace("_", " ") ?? "unknown"}
                      </span>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-foreground/75">
                      {item.student_friendly_explanation}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[24px] border border-border/70 bg-card/90 p-5">
            <h4 className="text-lg font-semibold text-foreground">
              Recommended actions
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Suggested next steps generated from the grounded explanation.
            </p>

            <div className="mt-4 space-y-3">
              {recommendedActions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recommended actions stored.
                </p>
              ) : (
                recommendedActions.map((item) => (
                  <div
                    key={item.action}
                    className="rounded-xl border border-border/70 bg-secondary/25 p-4"
                  >
                    <p className="font-medium text-foreground">{item.action}</p>
                    <p className="mt-2 text-sm leading-6 text-foreground/75">
                      {item.rationale}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </details>

      <div className="mt-6 rounded-2xl border border-dashed border-border/70 p-4">
        <p className="text-sm font-semibold text-foreground">Confidence note</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {card.confidence_note}
        </p>
      </div>

      <footer className="mt-5 flex flex-col justify-between gap-2 border-t border-border/70 pt-4 text-xs text-muted-foreground md:flex-row md:items-center">
        <p>
          LLM: {card.llm_provider} / {card.llm_model}
        </p>

        <p>
          Prompt: {card.prompt_version} · Schema: {card.structured_output_schema_version}
        </p>
      </footer>
    </article>
  );
}
