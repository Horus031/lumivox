import type { Database } from "@/types/database.types";

export type StudyRoom =
  Database["public"]["Tables"]["study_rooms"]["Row"];

export type StudyRoomMember =
  Database["public"]["Tables"]["study_room_members"]["Row"];

export type StudyRoomMessage =
  Database["public"]["Tables"]["study_room_messages"]["Row"];

export type StudyGroup = StudyRoom & {
  room_type: "group";
};