"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type PresenceStatus = "available" | "focusing" | "paused";

type PresencePayload = {
  userId: string;
  fullName: string;
  status: PresenceStatus;
  joinedAt: string;
};

type StudyRoomPresencePanelProps = {
  roomId: string;
  currentUserId: string;
  currentUserName: string;
};

type PresenceBroadcastPayload = {
  userId: string;
  fullName: string;
  status: PresenceStatus;
  joinedAt: string;
};

function flattenPresenceState(
  state: Record<string, PresencePayload[]>,
): PresencePayload[] {
  const raw = Object.values(state).flat();

  const unique = new Map<string, PresencePayload>();

  for (const participant of raw) {
    unique.set(participant.userId, participant);
  }

  return Array.from(unique.values());
}

function getStatusBadgeClass(status: PresenceStatus) {
  if (status === "focusing") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "paused") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-neutral-100 text-neutral-700";
}

export function StudyRoomPresencePanel({
  roomId,
  currentUserId,
  currentUserName,
}: StudyRoomPresencePanelProps) {
  const supabase = useMemo(() => createClient(), []);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const joinedAtRef = useRef(new Date().toISOString());

  /*
    Users who explicitly announced they are leaving.
    This prevents a stale Presence sync from briefly re-adding them.
  */
  const recentlyLeavingRef = useRef<Map<string, number>>(new Map());

  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "error"
  >("connecting");

  const [connectionMessage, setConnectionMessage] = useState(
    "Connecting to room presence...",
  );

  const [myStatus, setMyStatus] = useState<PresenceStatus>("available");

  const [participants, setParticipants] = useState<PresencePayload[]>([]);

  function pruneRecentlyLeaving() {
    const now = Date.now();

    for (const [userId, expiresAt] of recentlyLeavingRef.current.entries()) {
      if (expiresAt <= now) {
        recentlyLeavingRef.current.delete(userId);
      }
    }
  }

  function applyPresenceState(state: Record<string, PresencePayload[]>) {
    pruneRecentlyLeaving();

    const nextParticipants = flattenPresenceState(state).filter(
      (participant) => !recentlyLeavingRef.current.has(participant.userId),
    );

    setParticipants(nextParticipants);
  }

  function upsertParticipant(payload: PresenceBroadcastPayload) {
    recentlyLeavingRef.current.delete(payload.userId);

    setParticipants((current) => {
      const index = current.findIndex(
        (participant) => participant.userId === payload.userId,
      );

      if (index === -1) {
        return [...current, payload];
      }

      const next = [...current];
      next[index] = payload;
      return next;
    });
  }

  function removeParticipant(userId: string) {
    recentlyLeavingRef.current.set(userId, Date.now() + 10_000);

    setParticipants((current) =>
      current.filter((participant) => participant.userId !== userId),
    );
  }

  useEffect(() => {
    let mounted = true;

    async function subscribeToPresence() {
      try {
        setConnectionState("connecting");
        setConnectionMessage("Preparing authenticated realtime session...");

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          throw new Error(
            "Browser Supabase client does not have an authenticated user.",
          );
        }

        await supabase.realtime.setAuth();

        if (!mounted) return;

        const channel = supabase.channel(`study-room-presence:${roomId}`, {
          config: {
            private: true,
            presence: {
              key: currentUserId,
            },
          },
        });

        channelRef.current = channel;

        channel
          .on("presence", { event: "sync" }, () => {
            const state = channel.presenceState() as Record<
              string,
              PresencePayload[]
            >;

            applyPresenceState(state);
          })
          .on("presence", { event: "join" }, () => {
            const state = channel.presenceState() as Record<
              string,
              PresencePayload[]
            >;

            applyPresenceState(state);
          })
          .on("presence", { event: "leave" }, () => {
            const state = channel.presenceState() as Record<
              string,
              PresencePayload[]
            >;

            applyPresenceState(state);
          })

          /*
            Client Broadcast:
            immediate participant appearance
          */
          .on("broadcast", { event: "room-presence-joined" }, ({ payload }) => {
            upsertParticipant(payload as PresenceBroadcastPayload);
          })

          /*
            Client Broadcast:
            immediate status changes
          */
          .on(
            "broadcast",
            { event: "room-presence-status-changed" },
            ({ payload }) => {
              upsertParticipant(payload as PresenceBroadcastPayload);
            },
          )

          /*
            Client Broadcast:
            immediate disappearance on Leave room
          */
          .on(
            "broadcast",
            { event: "room-presence-leaving" },
            ({ payload }) => {
              const leavingPayload = payload as { userId: string };

              removeParticipant(leavingPayload.userId);
            },
          )

          .subscribe(async (status, error) => {
            if (status === "SUBSCRIBED") {
              setConnectionState("connected");
              setConnectionMessage("Presence connected.");

              const payload: PresenceBroadcastPayload = {
                userId: currentUserId,
                fullName: currentUserName,
                status: "available",
                joinedAt: joinedAtRef.current,
              };

              await channel.track(payload);

              await channel.send({
                type: "broadcast",
                event: "room-presence-joined",
                payload,
              });

              upsertParticipant(payload);
            }

            if (status === "CHANNEL_ERROR") {
              setConnectionState("error");
              setConnectionMessage(
                error?.message ?? "Presence channel failed to connect.",
              );
            }

            if (status === "TIMED_OUT") {
              setConnectionState("error");
              setConnectionMessage("Presence channel timed out.");
            }

            if (status === "CLOSED") {
              setConnectionState("error");
              setConnectionMessage("Presence channel was closed.");
            }
          });
      } catch (error) {
        setConnectionState("error");
        setConnectionMessage(
          error instanceof Error
            ? error.message
            : "Unexpected presence connection error.",
        );
      }
    }

    void subscribeToPresence();

    return () => {
      mounted = false;

      const channel = channelRef.current;

      if (channel) {
        void (async () => {
          try {
            await channel.untrack();
          } finally {
            await supabase.removeChannel(channel);
            channelRef.current = null;
          }
        })();
      }
    };
  }, [currentUserId, currentUserName, roomId, supabase]);

  useEffect(() => {
    async function handleLeaveRoom(event: Event) {
      const customEvent = event as CustomEvent<{ roomId: string }>;

      if (customEvent.detail?.roomId !== roomId) {
        return;
      }

      const channel = channelRef.current;

      if (!channel) return;

      try {
        removeParticipant(currentUserId);

        await channel.send({
          type: "broadcast",
          event: "room-presence-leaving",
          payload: {
            userId: currentUserId,
          },
        });

        await channel.untrack();
      } catch (error) {
        console.error("Failed to broadcast presence leave:", error);
      }
    }

    window.addEventListener("lumivox:leave-study-room", handleLeaveRoom);

    return () => {
      window.removeEventListener("lumivox:leave-study-room", handleLeaveRoom);
    };
  }, [currentUserId, roomId]);

  async function updateMyStatus(nextStatus: PresenceStatus) {
    setMyStatus(nextStatus);

    const channel = channelRef.current;

    if (!channel) return;

    const payload: PresenceBroadcastPayload = {
      userId: currentUserId,
      fullName: currentUserName,
      status: nextStatus,
      joinedAt: joinedAtRef.current,
    };

    /*
      Optimistic local state.
    */
    upsertParticipant(payload);

    /*
      Low-latency update for other clients.
    */
    await channel.send({
      type: "broadcast",
      event: "room-presence-status-changed",
      payload,
    });

    /*
      Presence remains the authoritative shared state.
    */
    await channel.track(payload);
  }

  return (
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-foreground">
            Realtime Presence
          </p>

          <h2 className="mt-2 text-2xl font-bold tracking-tight">
            Who is studying here now?
          </h2>

          <p className="mt-2 max-w-2xl text-neutral-600">
            Presence tracks connected learners, while low-latency room events
            keep status changes responsive.
          </p>
        </div>

        <div className="rounded-2xl bg-surface px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
            Connection
          </p>

          <p
            className={`mt-1 text-sm font-semibold capitalize ${
              connectionState === "connected"
                ? "text-emerald-700"
                : connectionState === "error"
                  ? "text-red-700"
                  : "text-neutral-700"
            }`}
          >
            {connectionState}
          </p>

          <p className="mt-1 max-w-55 text-xs leading-5 text-foreground">
            {connectionMessage}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border p-4">
        <p className="text-sm font-semibold">My current room status</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() => updateMyStatus("available")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition `}
          >
            Available
          </Button>

          <Button
            variant={"outline"}
            onClick={() => updateMyStatus("focusing")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition hover:text-primary-foreground`}
          >
            Focusing
          </Button>

          <Button
            variant={"outline"}
            onClick={() => updateMyStatus("paused")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition hover:text-primary-foreground`}
          >
            Paused
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Online participants</h3>

          <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold text-foreground">
            {participants.length} online
          </span>
        </div>

        {participants.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center">
            <p className="text-sm text-neutral-600">
              No live participant presence has been detected yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {participants.map((participant) => (
              <article
                key={participant.userId}
                className="rounded-2xl border p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{participant.fullName}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Connected now
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getStatusBadgeClass(
                      participant.status,
                    )}`}
                  >
                    {participant.status}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
