import { requireUser } from "@/lib/auth/require-user";

export async function getRecentStudyRoomMessages(
  roomId: string,
  limit = 80
) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("study_room_messages")
    .select(
      `
      id,
      room_id,
      sender_id,
      content,
      created_at,
      profiles:sender_id (
        id,
        full_name
      )
    `
    )
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch room messages: ${error.message}`);
  }

  return data ?? [];
}