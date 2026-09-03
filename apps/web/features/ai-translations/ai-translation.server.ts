import { fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import { requireUser } from "@/lib/auth/require-user";
import type {
  AiTranslationRequestItem,
  AiTranslationResponseItem,
  SupportedLocale,
} from "@/features/ai-translations/ai-translation.types";

type AiTranslationApiResponse = AiTranslationResponseItem;

type AiTranslationBatchApiResponse = {
  items: AiTranslationResponseItem[];
};

const AI_TRANSLATION_BATCH_SIZE = 30;

function normalizeSourceLocale(
  sourceLocale: "auto" | SupportedLocale | undefined
) {
  return sourceLocale ?? "auto";
}

export async function translateAiContent(
  item: AiTranslationRequestItem
): Promise<AiTranslationResponseItem> {
  const { user } = await requireUser();

  if (!item.sourceText.trim()) {
    return {
      entity_type: item.entityType,
      entity_id: item.entityId,
      field_name: item.fieldName,
      source_locale: normalizeSourceLocale(item.sourceLocale),
      target_locale: item.targetLocale,
      source_hash: "",
      translated_text: item.sourceText,
      provider: null,
      model_name: null,
      cached: true,
    };
  }

  if (item.sourceLocale === item.targetLocale) {
    return {
      entity_type: item.entityType,
      entity_id: item.entityId,
      field_name: item.fieldName,
      source_locale: normalizeSourceLocale(item.sourceLocale),
      target_locale: item.targetLocale,
      source_hash: "",
      translated_text: item.sourceText,
      provider: null,
      model_name: null,
      cached: true,
    };
  }

  return fetchAiApi<AiTranslationApiResponse>({
    path: "/api/v1/ai-translations/translate",
    body: {
      user_id: user.id,
      entity_type: item.entityType,
      entity_id: item.entityId,
      field_name: item.fieldName,
      source_text: item.sourceText,
      source_locale: normalizeSourceLocale(item.sourceLocale),
      target_locale: item.targetLocale,
    },
  });
}

export async function translateAiContentBatch(
  items: AiTranslationRequestItem[]
): Promise<AiTranslationResponseItem[]> {
  const { user } = await requireUser();

  const itemsToTranslate = items.filter((item) => {
    if (!item.sourceText.trim()) return false;
    if (item.sourceLocale && item.sourceLocale === item.targetLocale) {
      return false;
    }
    return true;
  });

  if (itemsToTranslate.length === 0) {
    return items.map((item) => ({
      entity_type: item.entityType,
      entity_id: item.entityId,
      field_name: item.fieldName,
      source_locale: normalizeSourceLocale(item.sourceLocale),
      target_locale: item.targetLocale,
      source_hash: "",
      translated_text: item.sourceText,
      provider: null,
      model_name: null,
      cached: true,
    }));
  }

  const translatedItems: AiTranslationResponseItem[] = [];

  for (
    let startIndex = 0;
    startIndex < itemsToTranslate.length;
    startIndex += AI_TRANSLATION_BATCH_SIZE
  ) {
    const chunk = itemsToTranslate.slice(
      startIndex,
      startIndex + AI_TRANSLATION_BATCH_SIZE
    );

    const response = await fetchAiApi<AiTranslationBatchApiResponse>({
      path: "/api/v1/ai-translations/batch",
      body: {
        items: chunk.map((item) => ({
          user_id: user.id,
          entity_type: item.entityType,
          entity_id: item.entityId,
          field_name: item.fieldName,
          source_text: item.sourceText,
          source_locale: normalizeSourceLocale(item.sourceLocale),
          target_locale: item.targetLocale,
        })),
      },
    });

    translatedItems.push(...response.items);
  }

  const translatedByKey = new Map(
    translatedItems.map((item) => [
      `${item.entity_type}:${item.entity_id}:${item.field_name}`,
      item,
    ])
  );

  return items.map((item) => {
    const key = `${item.entityType}:${item.entityId}:${item.fieldName}`;
    const translated = translatedByKey.get(key);

    if (translated) {
      return translated;
    }

    return {
      entity_type: item.entityType,
      entity_id: item.entityId,
      field_name: item.fieldName,
      source_locale: normalizeSourceLocale(item.sourceLocale),
      target_locale: item.targetLocale,
      source_hash: "",
      translated_text: item.sourceText,
      provider: null,
      model_name: null,
      cached: true,
    };
  });
}
