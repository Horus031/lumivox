import { requireUser } from "@/lib/auth/require-user";

export async function getCurrentEngagementStats() {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("user_engagement_stats")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch engagement stats: ${error.message}`);
  }

  return data;
}
