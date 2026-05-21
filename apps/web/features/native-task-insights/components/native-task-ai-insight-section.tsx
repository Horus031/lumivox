import type { NativeTaskAiInsightCardWithAssessment } from "@/features/native-task-insights/native-task-insight.types";

import { NativeTaskAiInsightCard } from "@/features/native-task-insights/components/native-task-ai-insight-card";

type NativeTaskAiInsightSectionProps = {
  cards: NativeTaskAiInsightCardWithAssessment[];
};

export function NativeTaskAiInsightSection({
  cards,
}: NativeTaskAiInsightSectionProps) {
  return (
    <section className="space-y-5">
      <div className="rounded-[28px] border border-border/70 bg-card/90 p-6 shadow-[0_18px_60px_-50px_hsl(var(--primary)/0.55)]">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-primary/70">
          Native task intelligence
        </p>

        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          AI Explanations for Real Lumivox Tasks
        </h2>

        <p className="mt-2 max-w-3xl text-muted-foreground">
          These cards translate native task risk assessments into grounded,
          student-facing guidance using structured Gemini outputs.
        </p>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-border/70 bg-card/80 p-10 text-center">
          <h3 className="text-lg font-semibold text-foreground">
            No native AI task insights yet
          </h3>

          <p className="mt-2 text-sm text-muted-foreground">
            Generate an AI insight from any task risk card to see it here.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {cards.map((card) => (
            <NativeTaskAiInsightCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}
