import { requireUser } from "@/lib/auth/require-user";
import type {
  WeeklyReflectionCardWithReflection,
} from "@/features/weekly-reflections/weekly-reflection.types";

export async function getLatestWeeklyReflectionCards(
  limit = 3
): Promise<WeeklyReflectionCardWithReflection[]> {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("weekly_reflection_cards")
    .select(
      `
      *,
      weekly_reflections (
        *
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

  return (data ?? []) as WeeklyReflectionCardWithReflection[];
}