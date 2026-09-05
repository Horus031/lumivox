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

function createFallbackTranslation(
  item: AiTranslationRequestItem
): AiTranslationResponseItem {
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

function logTranslationFallback(error: unknown) {
  console.error(
    "AI translation failed; falling back to source text.",
    error instanceof Error ? error.message : error
  );
}

export async function translateAiContent(
  item: AiTranslationRequestItem
): Promise<AiTranslationResponseItem> {
  const { user } = await requireUser();

  if (!item.sourceText.trim()) {
    return createFallbackTranslation(item);
  }

  if (item.sourceLocale === item.targetLocale) {
    return createFallbackTranslation(item);
  }

  try {
    return await fetchAiApi<AiTranslationApiResponse>({
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
  } catch (error) {
    logTranslationFallback(error);
    return createFallbackTranslation(item);
  }
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
    return items.map(createFallbackTranslation);
  }

  const translatedItems: AiTranslationResponseItem[] = [];

  try {
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
  } catch (error) {
    logTranslationFallback(error);
    return items.map(createFallbackTranslation);
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

    return createFallbackTranslation(item);
  });
}
