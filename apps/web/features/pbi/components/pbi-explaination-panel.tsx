import type { PbiExplanationPayload } from "@/features/pbi/pbi.types";
import { useTranslations } from "next-intl";

type PbiExplanationPanelProps = {
  explanation: PbiExplanationPayload | null;
};

function getInsightBadgeClass(type: "positive" | "warning" | "neutral") {
  if (type === "positive") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (type === "warning") {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-secondary text-foreground";
}

export function PbiExplanationPanel({ explanation }: PbiExplanationPanelProps) {
  const t = useTranslations("dashboard.pbiExplanation");

  if (!explanation) {
    return (
      <section className="rounded-2xl border border-dashed border-border/70 bg-card/80 p-5 text-center">
        <h2 className="text-lg font-semibold text-foreground">
          {t("emptyTitle")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("emptyDescription")}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl min-h-[310px] bg-card/90 p-4 shadow-[0_16px_50px_-40px_hsl(var(--primary)/0.55)]">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {t("eyebrow")}
          </p>

          <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
            {explanation.pbi_band}
          </h2>

          {/* <p className="mt-1 max-w-3xl text-sm leading-6 text-foreground/75">
            {explanation.overall_summary}
          </p> */}
        </div>
      </div>

      <div className="mt-4">
        <div className="space-y-3">
          {explanation.actionable_insights.map((insight) => (
            <article
              key={`${insight.linked_component}-${insight.title}`}
              className="rounded-xl flex items-center justify-between border border-border/70 bg-background/45 p-3 h-full"
            >
              <div>
                <h3 className="mt-2 text-sm font-semibold text-foreground">
                  {insight.title}
                </h3>

                <p className="mt-1 text-xs max-w-xl leading-5 text-foreground/70">
                  {insight.body}
                </p>
              </div>

              <span
                className={`inline-flex text-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${getInsightBadgeClass(
                  insight.type,
                )}`}
              >
                {t(`insightTypes.${insight.type}`)}
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
