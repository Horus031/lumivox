import { requireAdmin } from "@/features/admin/admin-auth";

export async function getAdminCmsSettings() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc("admin_get_cms_settings");

  if (error) {
    throw new Error(`Failed to fetch CMS settings: ${error.message}`);
  }

  return data ?? [];
}