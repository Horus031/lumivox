import { PageHeader } from "@/features/app-shell/components/page-header";

import {
  getMyStudyRooms,
  getPublicStudyRooms,
} from "@/features/study-rooms/study-room.queries";

import { CreateStudyRoomForm } from "@/features/study-rooms/components/create-study-room-form";
import { RoomListTabs } from "@/features/study-rooms/components/room-list-tabs";
import { getTranslations } from "next-intl/server";

export default async function RoomsPage() {
  const [myRooms, publicRooms, t] = await Promise.all([
    getMyStudyRooms(),
    getPublicStudyRooms(),
    getTranslations("rooms.page"),
  ]);

  const joinedRoomIds = new Set(myRooms.map((item) => item.room_id));

  const discoverablePublicRooms = publicRooms.filter(
    (room) => !joinedRoomIds.has(room.id),
  );

  return (
    <section>
      <div className="min-w-0 space-y-section">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
          action={<CreateStudyRoomForm />}
        />

        <RoomListTabs
          myRooms={myRooms}
          discoverablePublicRooms={discoverablePublicRooms}
        />
      </div>
    </section>
  );
}
