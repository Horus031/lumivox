export type SupportedLocale = "en" | "vi";

export type AiTranslatableEntityType =
  | "rag_chat_message"
  | "ai_recommendation"
  | "ai_insight_card"
  | "pbi_explanation"
  | "weekly_reflection"
  | "weekly_insight"
  | "roadmap_node"
  | "roadmap";

export type AiTranslationRequestItem = {
  entityType: AiTranslatableEntityType;
  entityId: string;
  fieldName: string;
  sourceText: string;
  sourceLocale?: "auto" | SupportedLocale;
  targetLocale: SupportedLocale;
};

export type AiTranslationResponseItem = {
  entity_type: string;
  entity_id: string;
  field_name: string;
  source_locale: "auto" | SupportedLocale;
  target_locale: SupportedLocale;
  source_hash: string;
  translated_text: string;
  provider?: string | null;
  model_name?: string | null;
  cached: boolean;
};
