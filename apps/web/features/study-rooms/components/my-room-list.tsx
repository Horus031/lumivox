import { useTranslations } from "next-intl";
import type { JoinedStudyRoom } from "../study-room.types";

import { RoomCard } from "@/features/study-rooms/components/room-card";

type MyRoomListProps = {
  rooms: JoinedStudyRoom[];
};

export function MyRoomList({ rooms }: MyRoomListProps) {
  const t = useTranslations("rooms.myList");
  const uniqueRoomsMap = new Map<string, (typeof rooms)[number]>();

  for (const room of rooms) {
    if (!uniqueRoomsMap.has(room.room_id)) {
      uniqueRoomsMap.set(room.room_id, room);
    }
  }

  const uniqueRooms = Array.from(uniqueRoomsMap.values());

  return (
    <section className="w-full min-w-0 space-y-card">
      <div>
        <h2 className="text-section font-semibold">{t("title")}</h2>
        <p className="mt-1 text-body text-secondary-text">
          {t("description")}
        </p>
      </div>

      {uniqueRooms.length === 0 ? (
        <div className="border-y border-border py-section text-center">
          <p className="text-body text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-card md:grid-cols-2 xl:grid-cols-3">
          {uniqueRooms.map((item) =>
            item.study_rooms ? (
              <RoomCard
                key={item.room_id}
                room={item.study_rooms}
                mode="joined"
              />
            ) : null,
          )}
        </div>
      )}
    </section>
  );
}
