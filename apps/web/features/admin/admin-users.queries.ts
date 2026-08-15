import { requireAdmin } from "@/features/admin/admin-auth";

export async function searchAdminUsers(query = "") {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc("admin_search_users", {
    p_query: query,
    p_limit: 50,
    p_offset: 0,
  });

  if (error) {
    throw new Error(`Failed to search users: ${error.message}`);
  }

  return data ?? [];
}

export async function getAdminUserDetail(userId: string) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc("admin_get_user_detail", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to fetch user detail: ${error.message}`);
  }

  return data?.[0] ?? null;
}