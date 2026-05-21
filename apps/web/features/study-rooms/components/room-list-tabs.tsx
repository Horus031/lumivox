/* eslint-disable @typescript-eslint/no-explicit-any */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MyRoomList } from "./my-room-list";
import { PublicRoomList } from "./public-room-list";

type RoomListTabsType = {
  myRooms: any;
  discoverablePublicRooms: any[];
};

export function RoomListTabs(props: RoomListTabsType) {
  const { myRooms, discoverablePublicRooms } = props;
  return (
    <Tabs defaultValue="my-room-list" className="w-full">
      <TabsList>
        <TabsTrigger value="my-room-list">My Room List</TabsTrigger>
        <TabsTrigger value="public-room">Public Rooms</TabsTrigger>
      </TabsList>
      <TabsContent className="w-full" value="my-room-list">
        <MyRoomList rooms={myRooms} />
      </TabsContent>
      <TabsContent value="public-room">
        <PublicRoomList rooms={discoverablePublicRooms} />
      </TabsContent>
    </Tabs>
  );
}
