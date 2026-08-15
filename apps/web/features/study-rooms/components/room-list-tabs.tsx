/* eslint-disable @typescript-eslint/no-explicit-any */
import { useTranslations } from "next-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MyRoomList } from "./my-room-list";
import { PublicRoomList } from "./public-room-list";
import { JoinPrivateRoomForm } from "./join-private-room-form";

type RoomListTabsType = {
  myRooms: any;
  discoverablePublicRooms: any[];
};

export function RoomListTabs(props: RoomListTabsType) {
  const { myRooms, discoverablePublicRooms } = props;
  const t = useTranslations("rooms.tabs");

  return (
    <Tabs defaultValue="my-room-list" className="w-full">
      <TabsList>
        <TabsTrigger value="my-room-list">{t("myRooms")}</TabsTrigger>
        <TabsTrigger value="public-room">{t("publicRooms")}</TabsTrigger>
        <TabsTrigger value="code-joining">{t("joinWithCode")}</TabsTrigger>
      </TabsList>
      <TabsContent className="w-full" value="my-room-list">
        <MyRoomList rooms={myRooms} />
      </TabsContent>
      <TabsContent value="public-room">
        <PublicRoomList rooms={discoverablePublicRooms} />
      </TabsContent>
      <TabsContent value="code-joining">
        <JoinPrivateRoomForm />
      </TabsContent>
    </Tabs>
  );
}
