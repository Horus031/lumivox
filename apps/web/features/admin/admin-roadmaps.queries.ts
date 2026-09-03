import { requireAdmin } from "@/features/admin/admin-auth";

export async function getAdminRoadmapMetrics() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc("admin_get_roadmap_metrics");

  if (error) {
    throw new Error(`Failed to fetch roadmap metrics: ${error.message}`);
  }

  return data?.[0] ?? null;
}

export async function searchAdminLearningRoadmaps({
  query = "",
  status = "all",
}: {
  query?: string;
  status?: string;
}) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc(
    "admin_search_learning_roadmaps",
    {
      p_query: query,
      p_status: status,
      p_limit: 50,
      p_offset: 0,
    }
  );

  if (error) {
    throw new Error(`Failed to search roadmaps: ${error.message}`);
  }

  return data ?? [];
}