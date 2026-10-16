"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  TrackToggle,
  useParticipants,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { toast } from "sonner";

import type { StudyRoomVoiceTokenResponse } from "@/features/study-room-voice/study-room-voice.types";
import { Button } from "@/components/ui/button";
import { Headphones, LogOut } from "lucide-react";

type StudyRoomVoicePanelProps = {
  roomId: string;
};

export function StudyRoomVoicePanel({ roomId }: StudyRoomVoicePanelProps) {
  const t = useTranslations("rooms.voice");
  const [isJoining, setIsJoining] = useState(false);
  const [credentials, setCredentials] =
    useState<StudyRoomVoiceTokenResponse | null>(null);

  async function handleJoinVoice() {
    try {
      setIsJoining(true);

      const response = await fetch("/api/livekit/study-room-voice-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.message ?? t("errors.joinFailed"));
        return;
      }

      setCredentials(data as StudyRoomVoiceTokenResponse);
      toast.success(t("toasts.joined"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("errors.unexpected"),
      );
    } finally {
      setIsJoining(false);
    }
  }

  function handleLeaveVoice() {
    setCredentials(null);
    toast.success(t("toasts.left"));
  }

  return (
    <section className="min-w-0 border-t border-border pt-card">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-caption font-medium text-muted-foreground">
            {t("eyebrow")}
          </p>

          <h2 className="mt-2 text-section font-semibold text-foreground">
            {t("title")}
          </h2>

          <p className="mt-1 max-w-2xl text-body text-secondary-text">
            {t("description")}
          </p>
        </div>

        {!credentials ? (
          <Button
            onClick={handleJoinVoice}
            disabled={isJoining}
            aria-busy={isJoining}
          >
            <Headphones aria-hidden="true" />
            {isJoining ? t("joining") : t("join")}
          </Button>
        ) : (
          <Button
            variant={"outline"}
            onClick={handleLeaveVoice}
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            <LogOut aria-hidden="true" />{t("leave")}
          </Button>
        )}
      </div>

      {!credentials ? (
        <div className="mt-6 border-t border-border py-card">
          <p className="text-body text-secondary-text">
            {t("inactive")}
          </p>
        </div>
      ) : (
        <div className="mt-card border-t border-border pt-card">
          <LiveKitRoom
            className="study-room-voice min-w-0"
            token={credentials.participant_token}
            serverUrl={credentials.server_url}
            connect={true}
            audio={true}
            video={false}
            data-lk-theme="default"
            onConnected={() => {
              toast.success(t("toasts.connected"));
            }}
            onDisconnected={() => {
              setCredentials(null);
            }}
            onError={(error) => {
              toast.error(t("errors.roomError", { message: error.message }));
            }}
          >
            <VoiceRoomContent />
          </LiveKitRoom>
        </div>
      )}
    </section>
  );
}

function VoiceRoomContent() {
  const t = useTranslations("rooms.voice");
  const participants = useParticipants();

  return (
    <div className="min-w-0 space-y-card">
      <RoomAudioRenderer />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-card">
        <div>
          <p className="text-label font-medium">{t("microphoneTitle")}</p>
          <p className="mt-1 text-body text-secondary-text">
            {t("microphoneDescription")}
          </p>
        </div>

        <TrackToggle source={Track.Source.Microphone} aria-label={t("microphoneTitle")} title={t("microphoneTitle")} className="min-h-touch rounded-md border border-border px-3 text-body sm:min-h-control" />
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-label font-medium">{t("participantsTitle")}</h3>

          <span className="text-caption text-muted-foreground">
            {t("participantsCount", { count: participants.length })}
          </span>
        </div>

        {participants.length === 0 ? (
          <div className="py-card text-body text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          <div className="grid gap-x-card divide-y divide-border md:grid-cols-2">
            {participants.map((participant) => (
              <article
                key={participant.identity}
                className="min-w-0 py-3"
              >
                <p className="text-body font-medium [overflow-wrap:anywhere]">
                  {participant.name ?? participant.identity}
                </p>

                <p className="mt-1 text-caption text-muted-foreground">
                  {participant.isLocal ? t("you") : t("roomParticipant")}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
