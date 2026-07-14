import { requireUser } from "@/lib/auth/require-user";

export async function getMyStudyGroups() {
  const { supabase, user } = await requireUser();

  const { data: memberships, error } = await supabase
    .from("study_room_members")
    .select(
      `
      id,
      room_id,
      role,
      membership_status,
      joined_at,
      study_rooms!inner (
        id,
        title,
        description,
        room_type,
        is_private,
        owner_id,
        created_at,
        updated_at
      )
      `,
    )
    .eq("user_id", user.id)
    .eq("membership_status", "active")
    .eq("study_rooms.room_type", "group")
    .order("joined_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch study groups: ${error.message}`);
  }

  return memberships ?? [];
}

export async function getStudyGroupById(groupId: string) {
  const { supabase, user } = await requireUser();

  const { data: membership, error } = await supabase
    .from("study_room_members")
    .select(
      `
      id,
      room_id,
      role,
      membership_status,
      joined_at,
      study_rooms!inner (
        id,
        title,
        description,
        room_type,
        is_private,
        owner_id,
        created_at,
        updated_at
      )
      `,
    )
    .eq("room_id", groupId)
    .eq("user_id", user.id)
    .eq("membership_status", "active")
    .eq("study_rooms.room_type", "group")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch study group: ${error.message}`);
  }

  return membership;
}

export async function getStudyGroupMembers(groupId: string) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase.rpc(
    "get_study_group_members_with_email",
    {
      p_group_id: groupId,
    },
  );

  if (error) {
    throw new Error(`Failed to fetch study group members: ${error.message}`);
  }

  return data ?? [];
}

export async function getStudyGroupMessages(groupId: string) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase.rpc(
    "get_study_group_messages_with_email",
    {
      p_group_id: groupId,
      p_limit: 100,
    },
  );

  if (error) {
    throw new Error(`Failed to fetch group messages: ${error.message}`);
  }

  return data ?? [];
}
