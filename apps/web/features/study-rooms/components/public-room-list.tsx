import { useTranslations } from "next-intl";
import type { StudyRoomWithOwnerPreview } from "../study-room.types";

import { RoomCard } from "@/features/study-rooms/components/room-card";

type PublicRoomListProps = {
  rooms: StudyRoomWithOwnerPreview[];
};

export function PublicRoomList({ rooms }: PublicRoomListProps) {
  const t = useTranslations("rooms.publicList");

  return (
    <section className="min-w-0 space-y-card">
      <div>
        <h2 className="text-section font-semibold">{t("title")}</h2>
        <p className="mt-1 text-body text-secondary-text">
          {t("description")}
        </p>
      </div>

      {rooms.length === 0 ? (
        <div className="border-y border-border py-section text-center">
          <p className="text-body text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-card md:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} mode="discover" />
          ))}
        </div>
      )}
    </section>
  );
}
