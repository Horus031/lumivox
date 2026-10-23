import type { PbiExplanationPayload } from "@/features/pbi/pbi.types";
import { useTranslations } from "next-intl";

type PbiExplanationPanelProps = {
  explanation: PbiExplanationPayload | null;
};

function getInsightBadgeClass(type: "positive" | "warning" | "neutral") {
  if (type === "positive") {
    return "border-success/30 bg-success/10 text-foreground";
  }

  if (type === "warning") {
    return "border-warning/30 bg-warning/10 text-foreground";
  }

  return "border-border bg-muted text-foreground";
}

export function PbiExplanationPanel({ explanation }: PbiExplanationPanelProps) {
  const t = useTranslations("dashboard.pbiExplanation");

  if (!explanation) {
    return (
      <section className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-section font-semibold text-foreground">
          {t("emptyTitle")}
        </h2>
        <p className="mt-1 text-body text-secondary-text">
          {t("emptyDescription")}
        </p>
      </section>
    );
  }

  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-caption font-medium text-muted-foreground">
            {t("eyebrow")}
          </p>

          <h2 className="mt-1 text-section font-semibold text-foreground [overflow-wrap:anywhere]">
            {explanation.pbi_band}
          </h2>

          <p className="mt-1 text-body text-secondary-text [overflow-wrap:anywhere]">
            {explanation.overall_summary}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="divide-y divide-border">
          {explanation.actionable_insights.map((insight) => (
            <article
              key={`${insight.linked_component}-${insight.title}`}
              className="min-w-0 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="min-w-0 flex-1 basis-40 text-label font-medium text-foreground [overflow-wrap:anywhere]">
                  {insight.title}
                </h3>

                <span
                  className={`inline-flex shrink-0 rounded-sm border px-2 py-0.5 text-caption font-medium ${getInsightBadgeClass(
                    insight.type,
                  )}`}
                >
                  {t(`insightTypes.${insight.type}`)}
                </span>
              </div>
              <p className="mt-1 text-body text-secondary-text [overflow-wrap:anywhere]">{insight.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
