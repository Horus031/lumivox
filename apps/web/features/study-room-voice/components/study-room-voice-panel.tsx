"use client";

import { useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  TrackToggle,
  useParticipants,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { toast } from "sonner";

import type { StudyRoomVoiceTokenResponse } from "@/features/study-room-voice/study-room-voice.types";

type StudyRoomVoicePanelProps = {
  roomId: string;
};

export function StudyRoomVoicePanel({ roomId }: StudyRoomVoicePanelProps) {
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
        toast.error(data.message ?? "Failed to join voice room.");
        return;
      }

      setCredentials(data as StudyRoomVoiceTokenResponse);
      toast.success("Joined voice room.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unexpected error while joining voice room.",
      );
    } finally {
      setIsJoining(false);
    }
  }

  function handleLeaveVoice() {
    setCredentials(null);
    toast.success("Left voice room.");
  }

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Voice Room
          </p>

          <h2 className="mt-2 text-2xl font-bold tracking-tight">
            Talk while studying
          </h2>

          <p className="mt-2 max-w-2xl text-neutral-600">
            Join the room voice channel to talk with other active learners.
          </p>
        </div>

        {!credentials ? (
          <button
            onClick={handleJoinVoice}
            disabled={isJoining}
            className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isJoining ? "Joining voice..." : "Join Voice"}
          </button>
        ) : (
          <button
            onClick={handleLeaveVoice}
            className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            Leave Voice
          </button>
        )}
      </div>

      {!credentials ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-neutral-600">
            Voice channel is currently inactive for you. Join when you want to
            talk with the room.
          </p>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border p-4">
          <LiveKitRoom
            token={credentials.participant_token}
            serverUrl={credentials.server_url}
            connect={true}
            audio={true}
            video={false}
            data-lk-theme="default"
            onConnected={() => {
              toast.success("Voice connection established.");
            }}
            onDisconnected={() => {
              setCredentials(null);
            }}
            onError={(error) => {
              toast.error(`Voice room error: ${error.message}`);
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
  const participants = useParticipants();

  return (
    <div className="space-y-5">
      <RoomAudioRenderer />

      <div className="flex flex-col justify-between gap-4 rounded-2xl bg-neutral-50 p-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold">Microphone control</p>
          <p className="mt-1 text-sm text-neutral-600">
            Toggle your microphone on or off while staying in the voice room.
          </p>
        </div>

        <TrackToggle source={Track.Source.Microphone} />
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Voice participants</h3>

          <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
            {participants.length} in voice
          </span>
        </div>

        {participants.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-sm text-neutral-600">
            No one is currently connected to voice.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {participants.map((participant) => (
              <article
                key={participant.identity}
                className="rounded-2xl border bg-white p-4"
              >
                <p className="font-semibold">
                  {participant.name ?? participant.identity}
                </p>

                <p className="mt-1 text-sm text-neutral-500">
                  {participant.isLocal ? "You" : "Room participant"}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
