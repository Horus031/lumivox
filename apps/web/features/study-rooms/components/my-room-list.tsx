/* eslint-disable @typescript-eslint/no-explicit-any */
import { useTranslations } from "next-intl";

import { RoomCard } from "@/features/study-rooms/components/room-card";

type MyRoomListProps = {
  rooms: Array<{
    room_id: string;
    study_rooms: any;
  }>;
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
    <section className="space-y-4 w-full">
      <div>
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <p className="mt-1 text-sm text-neutral-600">
          {t("description")}
        </p>
      </div>

      {uniqueRooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-8 text-center">
          <p className="text-sm text-neutral-600">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="space-y-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
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
