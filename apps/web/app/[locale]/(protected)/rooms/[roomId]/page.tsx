/* eslint-disable @typescript-eslint/no-explicit-any */
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

export default async function StudyRoomPage({ params }: StudyRoomPageProps) {
  const { locale, roomId } = await params;

  const [{ user }, roomPageData, members, initialMessages, t] =
    await Promise.all([
      requireUser(),
      getStudyRoomPageData(roomId),
      getStudyRoomMembers(roomId),
      getRecentStudyRoomMessages(roomId),
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

  return (
    <section className="px-4 py-6 md:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-row items-center justify-between">
          <PageHeader
            eyebrow={t("eyebrow")}
            title={room.title}
            description={
              room.description ??
              t("fallbackDescription")
            }
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
                <section className="flex flex-col gap-5 -mx-4 no-scrollbar max-h-[50vh] overflow-y-auto px-4">
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

                  <StudyRoomMemberRoster
                    roomId={room.id}
                    initialMembers={members as any}
                  />
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
            currentUserName={
              room.owner_id === user.id
                ? (room.profiles?.full_name ?? t("roomOwner"))
                : (members.find((member) => member.user_id === user.id)
                    ?.profiles?.full_name ?? t("lumivoxUser"))
            }
          />

          <StudyRoomChatPanel
            roomId={room.id}
            currentUserId={user.id}
            initialMessages={initialMessages as any}
          />
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
