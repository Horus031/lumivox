import { translateAiContentBatch } from "@/features/ai-translations/ai-translation.server";
import type { SupportedLocale } from "@/features/ai-translations/ai-translation.types";
import type {
  PbiActionableInsight,
  PbiComponentExplanation,
  PbiExplanationPayload,
} from "@/features/pbi/pbi.types";

export async function translatePbiExplanationPayload(
  explanation: PbiExplanationPayload | null,
  snapshotId: string | null | undefined,
  targetLocale: SupportedLocale,
): Promise<PbiExplanationPayload | null> {
  if (!explanation || !snapshotId || targetLocale === "en") {
    return explanation;
  }

  const componentExplanations =
    explanation.component_explanations as PbiComponentExplanation[];
  const actionableInsights =
    explanation.actionable_insights as PbiActionableInsight[];

  const translations = await translateAiContentBatch([
    {
      entityType: "pbi_explanation",
      entityId: snapshotId,
      fieldName: "pbi_band",
      sourceText: explanation.pbi_band,
      sourceLocale: "en",
      targetLocale,
    },
    {
      entityType: "pbi_explanation",
      entityId: snapshotId,
      fieldName: "overall_summary",
      sourceText: explanation.overall_summary,
      sourceLocale: "en",
      targetLocale,
    },
    ...componentExplanations.flatMap((component, index) => [
      {
        entityType: "pbi_explanation" as const,
        entityId: snapshotId,
        fieldName: `component_explanations.${index}.title`,
        sourceText: component.title,
        sourceLocale: "en" as const,
        targetLocale,
      },
      {
        entityType: "pbi_explanation" as const,
        entityId: snapshotId,
        fieldName: `component_explanations.${index}.message`,
        sourceText: component.message,
        sourceLocale: "en" as const,
        targetLocale,
      },
    ]),
    ...actionableInsights.flatMap((insight, index) => [
      {
        entityType: "pbi_explanation" as const,
        entityId: snapshotId,
        fieldName: `actionable_insights.${index}.title`,
        sourceText: insight.title,
        sourceLocale: "en" as const,
        targetLocale,
      },
      {
        entityType: "pbi_explanation" as const,
        entityId: snapshotId,
        fieldName: `actionable_insights.${index}.body`,
        sourceText: insight.body,
        sourceLocale: "en" as const,
        targetLocale,
      },
    ]),
  ]);

  const translatedTextByField = new Map(
    translations.map((item) => [item.field_name, item.translated_text]),
  );

  return {
    ...explanation,
    pbi_band: translatedTextByField.get("pbi_band") ?? explanation.pbi_band,
    overall_summary:
      translatedTextByField.get("overall_summary") ??
      explanation.overall_summary,
    component_explanations: componentExplanations.map((component, index) => ({
      ...component,
      title:
        translatedTextByField.get(`component_explanations.${index}.title`) ??
        component.title,
      message:
        translatedTextByField.get(`component_explanations.${index}.message`) ??
        component.message,
    })),
    actionable_insights: actionableInsights.map((insight, index) => ({
      ...insight,
      title:
        translatedTextByField.get(`actionable_insights.${index}.title`) ??
        insight.title,
      body:
        translatedTextByField.get(`actionable_insights.${index}.body`) ??
        insight.body,
    })),
  };
}
