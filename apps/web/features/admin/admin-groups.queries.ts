import { requireAdmin } from "@/features/admin/admin-auth";

export async function searchAdminStudyGroups({
  query = "",
  status = "all",
}: {
  query?: string;
  status?: string;
}) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc("admin_search_study_groups", {
    p_query: query,
    p_status: status,
    p_limit: 50,
    p_offset: 0,
  });

  if (error) {
    throw new Error(`Failed to search study groups: ${error.message}`);
  }

  return data ?? [];
}

export async function getAdminStudyGroupDetail(groupId: string) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc("admin_get_study_group_detail", {
    p_group_id: groupId,
  });

  if (error) {
    throw new Error(`Failed to fetch group detail: ${error.message}`);
  }

  return data?.[0] ?? null;
}

export async function getAdminStudyGroupMembers(groupId: string) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc("admin_get_study_group_members", {
    p_group_id: groupId,
  });

  if (error) {
    throw new Error(`Failed to fetch group members: ${error.message}`);
  }

  return data ?? [];
}

export async function getAdminStudyGroupMessages(groupId: string) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc("admin_get_study_group_messages", {
    p_group_id: groupId,
    p_limit: 100,
  });

  if (error) {
    throw new Error(`Failed to fetch group messages: ${error.message}`);
  }

  return data ?? [];
}