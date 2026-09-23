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
      className={`${className} animate-pulse rounded-2xl border border-border/60 bg-card/60`}
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
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-row items-center justify-between">
          <PageHeader
            eyebrow={t("eyebrow")}
            title={room.title}
            description={room.description ?? t("fallbackDescription")}
          />

          <div className="flex flex-row gap-4">
            <Dialog>
              <DialogTrigger>
                <Button>{t("viewDetails")}</Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl!">
                <DialogHeader>
                  <DialogTitle>{t("roomDetails")}</DialogTitle>
                </DialogHeader>

                <section className="flex max-h-[50vh] flex-col gap-5 overflow-y-auto -mx-4 px-4 no-scrollbar">
                  <article className="rounded-2xl border bg-background p-6 shadow-sm">
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
                      <div className="mt-5 rounded-2xl border border-dashed p-4">
                        <p className="text-sm font-semibold">
                          {t("privateInviteCode")}
                        </p>
                        <p className="mt-2 font-mono text-2xl font-bold tracking-[0.25em]">
                          {room.invite_code}
                        </p>
                        <p className="mt-2 text-sm text-neutral-600">
                          {t("privateInviteDescription")}
                        </p>
                      </div>
                    ) : null}
                  </article>

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
        </div>

        <div className="flex flex-row gap-3">
          <StudyRoomPresencePanel
            roomId={room.id}
            currentUserId={user.id}
            currentUserName={currentUserName}
          />

          <Suspense fallback={<RoomPanelFallback className="h-150 flex-1" />}>
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
    <div className="rounded-2xl bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold capitalize">{value}</p>
    </div>
  );
}
