"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import type { StudyRoomMemberWithProfile } from "@/features/study-rooms/study-room.types";

type StudyRoomMemberRosterProps = {
  roomId: string;
  initialMembers: StudyRoomMemberWithProfile[];
};

export function StudyRoomMemberRoster({
  roomId,
  initialMembers,
}: StudyRoomMemberRosterProps) {
  const t = useTranslations("rooms.memberRoster");
  const supabase = useMemo(() => createClient(), []);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [members, setMembers] =
    useState<StudyRoomMemberWithProfile[]>(initialMembers);

  const [liveState, setLiveState] = useState<
    "connecting" | "connected" | "error"
  >("connecting");

  async function refreshMembers() {
    const { data, error } = await supabase
      .from("study_room_members")
      .select(
        `
        *,
        profiles:user_id (
          id,
          full_name
        )
      `,
      )
      .eq("room_id", roomId)
      .eq("membership_status", "active")
      .order("joined_at", { ascending: true });

    if (error) {
      console.error("Failed to refresh study room members:", error);
      return;
    }

    setMembers((data ?? []) as StudyRoomMemberWithProfile[]);
  }

  function scheduleRefreshMembers() {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(() => {
      void refreshMembers();
    }, 120);
  }

  useEffect(() => {
    let mounted = true;

    async function subscribeToMemberChanges() {
      try {
        await supabase.realtime.setAuth();

        if (!mounted) return;

        const channel = supabase
          .channel(`study-room-members:${roomId}`, {
            config: {
              private: true,
            },
          })
          .on("broadcast", { event: "INSERT" }, () => {
            scheduleRefreshMembers();
          })
          .on("broadcast", { event: "UPDATE" }, () => {
            scheduleRefreshMembers();
          })
          .on("broadcast", { event: "DELETE" }, () => {
            scheduleRefreshMembers();
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              setLiveState("connected");
            }

            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              setLiveState("error");
            }
          });

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (error) {
        console.error("Member roster realtime error:", error);
        setLiveState("error");
      }
    }

    let cleanup: (() => void) | undefined;

    void subscribeToMemberChanges().then((result) => {
      cleanup = result;
    });

    return () => {
      mounted = false;

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      cleanup?.();
    };
  }, [roomId, supabase]);

  return (
    <article className="rounded-2xl border bg-background p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t("title")}</h2>
          <p className="mt-1 text-sm text-neutral-600">
            {t("description")}
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
            liveState === "connected"
              ? "bg-emerald-50 text-emerald-700"
              : liveState === "error"
                ? "bg-red-50 text-red-700"
                : "bg-neutral-100 text-neutral-700"
          }`}
        >
          {t(`connection.${liveState}`)}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {members.length === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-sm text-foreground">
            {t("empty")}
          </div>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-xl border p-3"
            >
              <div>
                <p className="font-medium">
                  {member.profiles?.full_name ?? t("unknownUser")}
                </p>
                <p className="mt-1 text-xs capitalize text-neutral-500">
                  {t(`roles.${member.role}`)}
                </p>
              </div>

              <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-foreground">
                {t("memberBadge")}
              </span>
            </div>
          ))
        )}
      </div>
    </article>
  );
}
