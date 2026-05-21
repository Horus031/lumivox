import type { Database } from "@/types/database.types";

export type StudyRoom =
  Database["public"]["Tables"]["study_rooms"]["Row"];

export type StudyRoomMember =
  Database["public"]["Tables"]["study_room_members"]["Row"];

export type StudyRoomVisibility =
  Database["public"]["Enums"]["study_room_visibility"];

export type StudyRoomWithOwnerPreview = Pick<
  StudyRoom,
  | "id"
  | "title"
  | "description"
  | "visibility"
  | "invite_code"
  | "max_participants"
  | "created_at"
> & {
  profiles:
    | {
        id: string;
        full_name: string | null;
      }
    | null;
};

export type JoinedStudyRoom = {
  room_id: string;
  study_rooms:
    | StudyRoomWithOwnerPreview
    | null;
};

export type StudyRoomMemberWithProfile = StudyRoomMember & {
  profiles:
    | {
        id: string;
        full_name: string | null;
      }
    | null;
};

export type StudyRoomPageData = StudyRoom & {
  profiles:
    | {
        id: string;
        full_name: string | null;
      }
    | null;
};