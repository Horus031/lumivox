// import Link from "next/link";

import type { WeeklyReflectionCardWithReflection } from "@/features/weekly-reflections/weekly-reflection.types";

// import { GenerateWeeklyReflectionButton } from "@/features/weekly-reflections/components/generate-weekly-reflection-button";
import { WeeklyReflectionCard } from "@/features/weekly-reflections/components/weekly-reflection-card";

type WeeklyReflectionSectionProps = {
  cards: WeeklyReflectionCardWithReflection[];
  compact?: boolean;
};

export function WeeklyReflectionSection({
  cards,
}: WeeklyReflectionSectionProps) {
  return (
    <section className="space-y-5">
      {cards.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-border/70 bg-card/80 p-10 text-center">
          <h3 className="text-lg font-semibold text-foreground">
            No weekly reflections generated yet
          </h3>

          <p className="mt-2 text-sm text-muted-foreground">
            Generate your first weekly reflection to compare recent study
            behaviour against the previous period.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {cards.map((card) => (
            <WeeklyReflectionCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}
