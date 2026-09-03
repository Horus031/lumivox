import { translateAiContentBatch } from "@/features/ai-translations/ai-translation.server";
import type { SupportedLocale } from "@/features/ai-translations/ai-translation.types";
import type {
  WeeklyReflectionAction,
  WeeklyReflectionCardWithReflection,
  WeeklyReflectionWatchout,
  WeeklyReflectionWin,
} from "@/features/weekly-reflections/weekly-reflection.types";

export async function translateWeeklyReflectionCards(
  cards: WeeklyReflectionCardWithReflection[],
  targetLocale: SupportedLocale,
): Promise<WeeklyReflectionCardWithReflection[]> {
  if (cards.length === 0 || targetLocale === "en") {
    return cards;
  }

  const translationItems = cards.flatMap((card) => {
    const wins = (card.wins as WeeklyReflectionWin[] | null) ?? [];
    const watchouts =
      (card.watchouts as WeeklyReflectionWatchout[] | null) ?? [];
    const actions =
      (card.next_week_actions as WeeklyReflectionAction[] | null) ?? [];

    return [
      {
        entityType: "weekly_reflection" as const,
        entityId: card.id,
        fieldName: "title",
        sourceText: card.title,
        sourceLocale: "en" as const,
        targetLocale,
      },
      {
        entityType: "weekly_reflection" as const,
        entityId: card.id,
        fieldName: "summary",
        sourceText: card.summary,
        sourceLocale: "en" as const,
        targetLocale,
      },
      {
        entityType: "weekly_reflection" as const,
        entityId: card.id,
        fieldName: "reflection_interpretation",
        sourceText: card.reflection_interpretation,
        sourceLocale: "en" as const,
        targetLocale,
      },
      {
        entityType: "weekly_reflection" as const,
        entityId: card.id,
        fieldName: "confidence_note",
        sourceText: card.confidence_note,
        sourceLocale: "en" as const,
        targetLocale,
      },
      ...wins.map((item, index) => ({
        entityType: "weekly_reflection" as const,
        entityId: card.id,
        fieldName: `wins.${index}.student_friendly_explanation`,
        sourceText: item.student_friendly_explanation,
        sourceLocale: "en" as const,
        targetLocale,
      })),
      ...watchouts.map((item, index) => ({
        entityType: "weekly_reflection" as const,
        entityId: card.id,
        fieldName: `watchouts.${index}.student_friendly_explanation`,
        sourceText: item.student_friendly_explanation,
        sourceLocale: "en" as const,
        targetLocale,
      })),
      ...actions.flatMap((item, index) => [
        {
          entityType: "weekly_reflection" as const,
          entityId: card.id,
          fieldName: `next_week_actions.${index}.action`,
          sourceText: item.action,
          sourceLocale: "en" as const,
          targetLocale,
        },
        {
          entityType: "weekly_reflection" as const,
          entityId: card.id,
          fieldName: `next_week_actions.${index}.rationale`,
          sourceText: item.rationale,
          sourceLocale: "en" as const,
          targetLocale,
        },
      ]),
    ];
  });

  const translations = await translateAiContentBatch(translationItems);
  const translatedTextByField = new Map(
    translations.map((item) => [
      `${item.entity_id}:${item.field_name}`,
      item.translated_text,
    ]),
  );

  return cards.map((card) => {
    const wins = (card.wins as WeeklyReflectionWin[] | null) ?? [];
    const watchouts =
      (card.watchouts as WeeklyReflectionWatchout[] | null) ?? [];
    const actions =
      (card.next_week_actions as WeeklyReflectionAction[] | null) ?? [];

    const getTranslation = (fieldName: string, fallback: string) =>
      translatedTextByField.get(`${card.id}:${fieldName}`) ?? fallback;

    return {
      ...card,
      title: getTranslation("title", card.title),
      summary: getTranslation("summary", card.summary),
      reflection_interpretation: getTranslation(
        "reflection_interpretation",
        card.reflection_interpretation,
      ),
      confidence_note: getTranslation("confidence_note", card.confidence_note),
      wins: wins.map((item, index) => ({
        ...item,
        student_friendly_explanation: getTranslation(
          `wins.${index}.student_friendly_explanation`,
          item.student_friendly_explanation,
        ),
      })) as unknown as typeof card.wins,
      watchouts: watchouts.map((item, index) => ({
        ...item,
        student_friendly_explanation: getTranslation(
          `watchouts.${index}.student_friendly_explanation`,
          item.student_friendly_explanation,
        ),
      })) as unknown as typeof card.watchouts,
      next_week_actions: actions.map((item, index) => ({
        ...item,
        action: getTranslation(`next_week_actions.${index}.action`, item.action),
        rationale: getTranslation(
          `next_week_actions.${index}.rationale`,
          item.rationale,
        ),
      })) as unknown as typeof card.next_week_actions,
    };
  });
}
