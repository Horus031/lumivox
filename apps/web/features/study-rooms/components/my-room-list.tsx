/* eslint-disable @typescript-eslint/no-explicit-any */
import { RoomCard } from "@/features/study-rooms/components/room-card";

type MyRoomListProps = {
  rooms: Array<{
    room_id: string;
    study_rooms: any;
  }>;
};

export function MyRoomList({ rooms }: MyRoomListProps) {
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
        <h2 className="text-xl font-semibold">My study rooms</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Rooms you have already joined and can re-enter.
        </p>
      </div>

      {uniqueRooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-8 text-center">
          <p className="text-sm text-neutral-600">
            You have not joined any study rooms yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2">
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
