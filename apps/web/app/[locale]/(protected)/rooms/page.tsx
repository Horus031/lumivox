import { PageHeader } from "@/features/app-shell/components/page-header";

import {
  getMyStudyRooms,
  getPublicStudyRooms,
} from "@/features/study-rooms/study-room.queries";

import { CreateStudyRoomForm } from "@/features/study-rooms/components/create-study-room-form";
// import { MyRoomList } from "@/features/study-rooms/components/my-room-list";
// import { PublicRoomList } from "@/features/study-rooms/components/public-room-list";
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
      <div className="mx-auto space-y-8">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <PageHeader
              eyebrow={t("eyebrow")}
              title={t("title")}
              description={t("description")}
            />
            <CreateStudyRoomForm />
          </div>
        </div>

        <RoomListTabs
          myRooms={myRooms}
          discoverablePublicRooms={discoverablePublicRooms}
        />
      </div>
    </section>
  );
}
