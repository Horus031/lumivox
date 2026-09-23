import { requireUser } from "@/lib/auth/require-user";
import type { SupportedLocale } from "@/features/ai-translations/ai-translation.types";
import { translateWeeklyReflectionCards } from "@/features/weekly-reflections/weekly-reflection-translations.server";
import type {
  WeeklyReflectionCardView,
} from "@/features/weekly-reflections/weekly-reflection.types";

export async function getLatestWeeklyReflectionCards(
  limit = 3,
  targetLocale?: SupportedLocale,
): Promise<WeeklyReflectionCardView[]> {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("weekly_reflection_cards")
    .select(
      `
      id,
      title,
      summary,
      reflection_interpretation,
      confidence_note,
      wins,
      watchouts,
      next_week_actions,
      weekly_reflections (
        reflection_direction,
        current_window_start,
        current_window_end,
        current_metrics
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(
      `Failed to fetch weekly reflection cards: ${error.message}`
    );
  }

  const cards = (data ?? []) as WeeklyReflectionCardView[];

  if (!targetLocale) {
    return cards;
  }

  return translateWeeklyReflectionCards(cards, targetLocale);
}
