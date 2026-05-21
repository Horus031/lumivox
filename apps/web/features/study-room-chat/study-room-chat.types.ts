import type { Database } from "@/types/database.types";

export type StudyRoomMessage =
  Database["public"]["Tables"]["study_room_messages"]["Row"];

export type StudyRoomMessageWithSender = StudyRoomMessage & {
  profiles:
    | {
        id: string;
        full_name: string | null;
      }
    | null;
};