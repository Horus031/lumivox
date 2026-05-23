/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";
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

type StudyRoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export default async function StudyRoomPage({ params }: StudyRoomPageProps) {
  const { roomId } = await params;

  const [{ user }, roomPageData, members, initialMessages] = await Promise.all([
    requireUser(),
    getStudyRoomPageData(roomId),
    getStudyRoomMembers(roomId),
    getRecentStudyRoomMessages(roomId),
  ]);

  if (!roomPageData) {
    redirect("/rooms");
  }

  const { room, membership } = roomPageData;

  if (!room) {
    notFound();
  }

  const ownerCannotLeave = membership.role === "owner";

  return (
    <section className="px-4 py-6 md:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader
          eyebrow="Study Room"
          title={room.title}
          description={
            room.description ??
            "A collaborative room where learners can stay present and study together."
          }
          action={
            <LeaveRoomButton
              roomId={room.id}
              disabledForOwner={ownerCannotLeave}
            />
          }
        />

        <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <article className="rounded-2xl border bg-background p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Room details</h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <DetailCard label="Visibility" value={room.visibility} />

              <DetailCard
                label="Maximum participants"
                value={`${room.max_participants}`}
              />

              <DetailCard
                label="Owner"
                value={room.profiles?.full_name ?? "Unknown user"}
              />

              <DetailCard label="Your role" value={membership.role} />
            </div>

            {room.visibility === "private" && membership.role === "owner" ? (
              <div className="mt-5 rounded-2xl border border-dashed p-4">
                <p className="text-sm font-semibold">Private invite code</p>
                <p className="mt-2 font-mono text-2xl font-bold tracking-[0.25em]">
                  {room.invite_code}
                </p>
                <p className="mt-2 text-sm text-neutral-600">
                  Share this code with people you want to invite into the room.
                </p>
              </div>
            ) : null}
          </article>

          <StudyRoomMemberRoster
            roomId={room.id}
            initialMembers={members as any}
          />
        </section>

        <StudyRoomPresencePanel
          roomId={room.id}
          currentUserId={user.id}
          currentUserName={
            room.owner_id === user.id
              ? (room.profiles?.full_name ?? "Room owner")
              : (members.find((member) => member.user_id === user.id)?.profiles
                  ?.full_name ?? "Lumivox user")
          }
        />

        <StudyRoomVoicePanel roomId={room.id} />

        <StudyRoomChatPanel
          roomId={room.id}
          currentUserId={user.id}
          initialMessages={initialMessages as any}
        />
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
