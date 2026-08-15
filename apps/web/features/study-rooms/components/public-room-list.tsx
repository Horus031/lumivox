/* eslint-disable @typescript-eslint/no-explicit-any */
import { useTranslations } from "next-intl";

import { RoomCard } from "@/features/study-rooms/components/room-card";

type PublicRoomListProps = {
  rooms: any[];
};

export function PublicRoomList({ rooms }: PublicRoomListProps) {
  const t = useTranslations("rooms.publicList");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <p className="mt-1 text-sm text-neutral-600">
          {t("description")}
        </p>
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-8 text-center">
          <p className="text-sm text-neutral-600">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} mode="discover" />
          ))}
        </div>
      )}
    </section>
  );
}
