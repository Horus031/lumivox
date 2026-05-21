import { requireUser } from "@/lib/auth/require-user";

export async function getMyStudyRooms() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("study_room_members")
    .select(
      `
      room_id,
      study_rooms (
        id,
        title,
        description,
        visibility,
        invite_code,
        max_participants,
        created_at,
        profiles:owner_id (
          id,
          full_name
        )
      )
    `,
    )
    .eq("membership_status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch joined study rooms: ${error.message}`);
  }

  return data ?? [];
}

export async function getPublicStudyRooms() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("study_rooms")
    .select(
      `
      id,
      title,
      description,
      visibility,
      invite_code,
      max_participants,
      created_at,
      profiles:owner_id (
        id,
        full_name
      )
    `,
    )
    .eq("visibility", "public")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Failed to fetch public study rooms: ${error.message}`);
  }

  return data ?? [];
}

export async function getStudyRoomPageData(roomId: string) {
  const { supabase, user } = await requireUser();

  const { data: membership, error: membershipError } = await supabase
    .from("study_room_members")
    .select("room_id, role, membership_status")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .eq("membership_status", "active")
    .maybeSingle();

  if (membershipError) {
    throw new Error(
      `Failed to verify study room membership: ${membershipError.message}`,
    );
  }

  if (!membership) {
    return null;
  }

  const { data: room, error: roomError } = await supabase
    .from("study_rooms")
    .select(
      `
      *,
      profiles:owner_id (
        id,
        full_name
      )
    `,
    )
    .eq("id", roomId)
    .single();

  if (roomError) {
    throw new Error(`Failed to fetch study room: ${roomError.message}`);
  }

  return {
    room,
    membership,
  };
}

export async function getStudyRoomMembers(roomId: string) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("study_room_members")
    .select(
      `
      *,
      profiles:user_id (
        id,
        full_name
      )
    `,
    )
    .eq("room_id", roomId)
    .eq("membership_status", "active")
    .order("joined_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch study room members: ${error.message}`);
  }

  return data ?? [];
}
