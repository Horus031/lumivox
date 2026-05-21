import { requireUser } from "@/lib/auth/require-user";

export async function getCurrentEngagementStats() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("user_engagement_stats")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to fetch engagement stats: ${error.message}`
    );
  }

  return data;
}

export async function getRecentRewardLedgerEntries(limit = 5) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("reward_ledger")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(
      `Failed to fetch recent reward ledger entries: ${error.message}`
    );
  }

  return data ?? [];
}