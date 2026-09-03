import { requireAdmin } from "@/features/admin/admin-auth";

export async function getAdminAiTranslationMetrics() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc(
    "admin_get_ai_translation_metrics"
  );

  if (error) {
    throw new Error(`Failed to fetch AI translation metrics: ${error.message}`);
  }

  return data?.[0] ?? null;
}

export async function searchAdminAiContentTranslations({
  query = "",
  targetLocale = "all",
  status = "all",
}: {
  query?: string;
  targetLocale?: string;
  status?: string;
}) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc(
    "admin_search_ai_content_translations",
    {
      p_query: query,
      p_target_locale: targetLocale,
      p_status: status,
      p_limit: 50,
      p_offset: 0,
    }
  );

  if (error) {
    throw new Error(`Failed to search AI translations: ${error.message}`);
  }

  return data ?? [];
}