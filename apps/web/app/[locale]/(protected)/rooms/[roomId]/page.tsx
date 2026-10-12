/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth/require-user";
import { redirect } from "@/i18n/navigation";
import { PageHeader } from "@/features/app-shell/components/page-header";

import {
  getStudyRoomMembers,
  getStudyRoomPageData,
} from "@/features/study-rooms/study-room.queries";

import { LeaveRoomButton } from "@/features/study-rooms/components/leave-room-button";
import { StudyRoomPresencePanel } from "@/features/study-rooms/components/study-room-presence-panel";
import { StudyRoomMemberRoster } from "@/features/study-rooms/components/study-room-member-roster";

import { getRecentStudyRoomMessages } from "@/features/study-room-chat/study-room-chat.queries";
import { StudyRoomChatPanel } from "@/features/study-room-chat/components/study-room-chat-panel";

import { StudyRoomVoicePanel } from "@/features/study-room-voice/components/study-room-voice-panel";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";

type StudyRoomPageProps = {
  params: Promise<{
    locale: string;
    roomId: string;
  }>;
};

async function RoomMemberRosterSection({ roomId }: { roomId: string }) {
  const members = await getStudyRoomMembers(roomId);

  return (
    <StudyRoomMemberRoster
      roomId={roomId}
      initialMembers={members as any}
    />
  );
}

async function RoomChatSection({
  roomId,
  currentUserId,
}: {
  roomId: string;
  currentUserId: string;
}) {
  const initialMessages = await getRecentStudyRoomMessages(roomId);

  return (
    <StudyRoomChatPanel
      roomId={roomId}
      currentUserId={currentUserId}
      initialMessages={initialMessages as any}
    />
  );
}

function RoomPanelFallback({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`${className} min-w-0 animate-pulse rounded-lg bg-muted`}
    />
  );
}

export default async function StudyRoomPage({ params }: StudyRoomPageProps) {
  const { locale, roomId } = await params;

  const [{ user }, roomPageData, t] = await Promise.all([
    requireUser(),
    getStudyRoomPageData(roomId),
    getTranslations("rooms.detail"),
  ]);

  if (!roomPageData) {
    redirect({ href: "/rooms", locale });
    return null;
  }

  const { room, membership } = roomPageData;

  if (!room) {
    notFound();
  }

  const currentUserName =
    membership.profiles?.full_name ??
    (room.owner_id === user.id ? room.profiles?.full_name : null) ??
    t("lumivoxUser");

  return (
    <section>
      <div className="min-w-0 space-y-section">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={room.title}
          description={room.description ?? t("fallbackDescription")}
          action={
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline"><Info aria-hidden="true" />{t("viewDetails")}</Button>
                </DialogTrigger>
                <DialogContent aria-describedby={undefined} className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-card sm:max-w-2xl [&>[data-slot=dialog-close]]:top-1 [&>[data-slot=dialog-close]]:right-1 [&>[data-slot=dialog-close]]:grid [&>[data-slot=dialog-close]]:size-touch [&>[data-slot=dialog-close]]:place-items-center sm:[&>[data-slot=dialog-close]]:size-control">
                  <DialogHeader className="pr-10 text-left">
                    <DialogTitle className="text-section">{t("roomDetails")}</DialogTitle>
                  </DialogHeader>

                  <section className="flex min-w-0 flex-col gap-section">
                    <div className="min-w-0">
                      <div className="grid gap-4 md:grid-cols-2">
                        <DetailCard
                          label={t("labels.visibility")}
                          value={t(`visibility.${room.visibility}`)}
                        />

                        <DetailCard
                          label={t("labels.maxParticipants")}
                          value={t("maxParticipants", {
                            count: room.max_participants,
                          })}
                        />

                        <DetailCard
                          label={t("labels.owner")}
                          value={room.profiles?.full_name ?? t("unknownUser")}
                        />

                        <DetailCard
                          label={t("labels.yourRole")}
                          value={t(`roles.${membership.role}`)}
                        />
                      </div>

                      {room.visibility === "private" &&
                      membership.role === "owner" ? (
                        <div className="mt-card border-t border-border pt-card">
                          <p className="text-label font-medium">
                            {t("privateInviteCode")}
                          </p>
                          <p className="mt-1 font-mono text-section font-semibold tracking-normal [overflow-wrap:anywhere]">
                            {room.invite_code}
                          </p>
                          <p className="mt-1 text-body text-secondary-text">
                            {t("privateInviteDescription")}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <Suspense fallback={<RoomPanelFallback className="h-64" />}>
                      <RoomMemberRosterSection roomId={room.id} />
                    </Suspense>
                  </section>

                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">{t("cancel")}</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <LeaveRoomButton roomId={room.id} />
            </div>
          }
        />

        <div className="grid min-w-0 gap-section xl:grid-cols-[20rem_minmax(0,1fr)]">
          <StudyRoomPresencePanel
            roomId={room.id}
            currentUserId={user.id}
            currentUserName={currentUserName}
          />

          <Suspense fallback={<RoomPanelFallback className="h-112" />}>
            <RoomChatSection
              roomId={room.id}
              currentUserId={user.id}
            />
          </Suspense>
        </div>

        <StudyRoomVoicePanel roomId={room.id} />
      </div>
    </section>
  );
}

type DetailCardProps = {
  label: string;
  value: string;
};

function DetailCard({ label, value }: DetailCardProps) {
  return (
    <div className="min-w-0">
      <p className="text-label font-medium text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-body font-medium [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}
