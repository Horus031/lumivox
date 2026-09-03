import { translateAiContentBatch } from "@/features/ai-translations/ai-translation.server";
import type { SupportedLocale } from "@/features/ai-translations/ai-translation.types";
import type {
  AiInsightCard,
  AiInsightEvidenceItem,
  AiInsightRecommendedAction,
} from "@/features/ai-insights/ai-insight.types";

type AiInsightCardWithJsonPayloads = AiInsightCard & {
  evidence: unknown;
  recommended_actions: unknown;
};

export async function translateAiInsightCards<
  TCard extends AiInsightCardWithJsonPayloads,
>(cards: TCard[], targetLocale: SupportedLocale): Promise<TCard[]> {
  if (cards.length === 0 || targetLocale === "en") {
    return cards;
  }

  const translationItems = cards.flatMap((card) => {
    const evidence = (card.evidence as AiInsightEvidenceItem[] | null) ?? [];
    const recommendedActions =
      (card.recommended_actions as AiInsightRecommendedAction[] | null) ?? [];

    return [
      {
        entityType: "ai_insight_card" as const,
        entityId: card.id,
        fieldName: "title",
        sourceText: card.title,
        sourceLocale: "en" as const,
        targetLocale,
      },
      {
        entityType: "ai_insight_card" as const,
        entityId: card.id,
        fieldName: "summary",
        sourceText: card.summary,
        sourceLocale: "en" as const,
        targetLocale,
      },
      {
        entityType: "ai_insight_card" as const,
        entityId: card.id,
        fieldName: "risk_interpretation",
        sourceText: card.risk_interpretation,
        sourceLocale: "en" as const,
        targetLocale,
      },
      {
        entityType: "ai_insight_card" as const,
        entityId: card.id,
        fieldName: "confidence_note",
        sourceText: card.confidence_note,
        sourceLocale: "en" as const,
        targetLocale,
      },
      ...evidence.map((item, index) => ({
        entityType: "ai_insight_card" as const,
        entityId: card.id,
        fieldName: `evidence.${index}.student_friendly_explanation`,
        sourceText: item.student_friendly_explanation,
        sourceLocale: "en" as const,
        targetLocale,
      })),
      ...recommendedActions.flatMap((item, index) => [
        {
          entityType: "ai_insight_card" as const,
          entityId: card.id,
          fieldName: `recommended_actions.${index}.action`,
          sourceText: item.action,
          sourceLocale: "en" as const,
          targetLocale,
        },
        {
          entityType: "ai_insight_card" as const,
          entityId: card.id,
          fieldName: `recommended_actions.${index}.rationale`,
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
    const evidence = (card.evidence as AiInsightEvidenceItem[] | null) ?? [];
    const recommendedActions =
      (card.recommended_actions as AiInsightRecommendedAction[] | null) ?? [];

    const getTranslation = (fieldName: string, fallback: string) =>
      translatedTextByField.get(`${card.id}:${fieldName}`) ?? fallback;

    return {
      ...card,
      title: getTranslation("title", card.title),
      summary: getTranslation("summary", card.summary),
      risk_interpretation: getTranslation(
        "risk_interpretation",
        card.risk_interpretation,
      ),
      confidence_note: getTranslation("confidence_note", card.confidence_note),
      evidence: evidence.map((item, index) => ({
        ...item,
        student_friendly_explanation: getTranslation(
          `evidence.${index}.student_friendly_explanation`,
          item.student_friendly_explanation,
        ),
      })) as TCard["evidence"],
      recommended_actions: recommendedActions.map((item, index) => ({
        ...item,
        action: getTranslation(`recommended_actions.${index}.action`, item.action),
        rationale: getTranslation(
          `recommended_actions.${index}.rationale`,
          item.rationale,
        ),
      })) as TCard["recommended_actions"],
    };
  });
}
