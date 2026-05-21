/* eslint-disable @typescript-eslint/no-explicit-any */
import { RoomCard } from "@/features/study-rooms/components/room-card";

type PublicRoomListProps = {
  rooms: any[];
};

export function PublicRoomList({ rooms }: PublicRoomListProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Discover public rooms</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Join collaborative spaces that are open to the Lumivox community.
        </p>
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-8 text-center">
          <p className="text-sm text-neutral-600">
            No public study rooms are available yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              mode="discover"
            />
          ))}
        </div>
      )}
    </section>
  );
}