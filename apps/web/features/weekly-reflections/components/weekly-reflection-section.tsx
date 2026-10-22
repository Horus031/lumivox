// import { Link } from "@/i18n/navigation";;
import { useTranslations } from "next-intl";

import type { WeeklyReflectionCardView } from "@/features/weekly-reflections/weekly-reflection.types";

// import { GenerateWeeklyReflectionButton } from "@/features/weekly-reflections/components/generate-weekly-reflection-button";
import { WeeklyReflectionCard } from "@/features/weekly-reflections/components/weekly-reflection-card";

type WeeklyReflectionSectionProps = {
  cards: WeeklyReflectionCardView[];
  compact?: boolean;
};

export function WeeklyReflectionSection({
  cards,
}: WeeklyReflectionSectionProps) {
  const t = useTranslations("reflections.section");

  return (
    <section className="min-w-0 space-y-section">
      {cards.length === 0 ? (
        <div className="min-w-0 border-t border-border py-section">
          <h3 className="text-section font-semibold text-foreground">
            {t("emptyTitle")}
          </h3>

          <p className="mt-2 text-body text-muted-foreground">
            {t("emptyDescription")}
          </p>
        </div>
      ) : (
        <div className="min-w-0 space-y-section">
          {cards.map((card) => (
            <WeeklyReflectionCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}
