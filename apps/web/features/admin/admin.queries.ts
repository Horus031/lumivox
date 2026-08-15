import { requireAdmin } from "@/features/admin/admin-auth";

export async function getAdminDashboardMetrics() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc("get_admin_dashboard_metrics");

  if (error) {
    throw new Error(`Failed to fetch admin metrics: ${error.message}`);
  }

  return data?.[0] ?? null;
}

export async function getAdminRecentUsers() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc("get_admin_recent_users", {
    p_limit: 10,
  });

  if (error) {
    throw new Error(`Failed to fetch recent users: ${error.message}`);
  }

  return data ?? [];
}