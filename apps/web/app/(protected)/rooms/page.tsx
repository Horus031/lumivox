import { PageHeader } from "@/features/app-shell/components/page-header";

import {
  getMyStudyRooms,
  getPublicStudyRooms,
} from "@/features/study-rooms/study-room.queries";

import { CreateStudyRoomForm } from "@/features/study-rooms/components/create-study-room-form";
import { JoinPrivateRoomForm } from "@/features/study-rooms/components/join-private-room-form";
// import { MyRoomList } from "@/features/study-rooms/components/my-room-list";
// import { PublicRoomList } from "@/features/study-rooms/components/public-room-list";
import { RoomListTabs } from "@/features/study-rooms/components/room-list-tabs";

export default async function RoomsPage() {
  const [myRooms, publicRooms] = await Promise.all([
    getMyStudyRooms(),
    getPublicStudyRooms(),
  ]);

  const joinedRoomIds = new Set(myRooms.map((item) => item.room_id));

  const discoverablePublicRooms = publicRooms.filter(
    (room) => !joinedRoomIds.has(room.id),
  );

  return (
    <section className="px-4 py-6 md:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <PageHeader
              eyebrow="Lumivox"
              title="Study Rooms"
              description="Create or join collaborative study spaces where learners can stay present, focus together, and build a stronger sense of study momentum."
            />
            <CreateStudyRoomForm />
          </div>

          <JoinPrivateRoomForm />
        </div>

        <RoomListTabs myRooms={myRooms} discoverablePublicRooms={discoverablePublicRooms}/>

        {/* <MyRoomList rooms={myRooms as any} />

        <PublicRoomList rooms={discoverablePublicRooms as any[]} /> */}
      </div>
    </section>
  );
}
