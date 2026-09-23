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
        max_participants,
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
      max_participants,
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

  const { data, error } = await supabase
    .from("study_room_members")
    .select(
      `
      room_id,
      role,
      membership_status,
      profiles:user_id (
        id,
        full_name
      ),
      study_rooms!inner (
        id,
        title,
        description,
        visibility,
        max_participants,
        owner_id,
        invite_code,
        profiles:owner_id (
          id,
          full_name
        )
      )
      `,
    )
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .eq("membership_status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load study room membership: ${error.message}`,
    );
  }

  if (!data?.study_rooms) {
    return null;
  }

  return {
    room: data.study_rooms,
    membership: {
      room_id: data.room_id,
      role: data.role,
      membership_status: data.membership_status,
      profiles: data.profiles,
    },
  };
}

export async function getStudyRoomMembers(roomId: string) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("study_room_members")
    .select(
      `
      id,
      role,
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
