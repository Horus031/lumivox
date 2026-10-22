"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  const refreshMembers = useCallback(async () => {
    const { data, error } = await supabase
      .from("study_room_members")
      .select(
        `
        id,
        role,
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
  }, [roomId, supabase]);

  const scheduleRefreshMembers = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(() => {
      void refreshMembers();
    }, 120);
  }, [refreshMembers]);

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
  }, [roomId, scheduleRefreshMembers, supabase]);

  return (
    <section className="min-w-0 border-t border-border pt-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-section font-semibold">{t("title")}</h2>
          <p className="mt-1 text-body text-secondary-text">
            {t("description")}
          </p>
        </div>

        <span
          role="status"
          className={`rounded-sm px-2 py-0.5 text-caption font-medium ${
            liveState === "connected"
              ? "bg-success/10 text-success"
              : liveState === "error"
                ? "bg-danger/10 text-danger"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {t(`connection.${liveState}`)}
        </span>
      </div>

      <div className="mt-2 divide-y divide-border">
        {members.length === 0 ? (
          <div className="py-card text-body text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3"
            >
              <div className="min-w-0 flex-1 basis-32">
                <p className="text-body font-medium [overflow-wrap:anywhere]">
                  {member.profiles?.full_name ?? t("unknownUser")}
                </p>
                <p className="mt-1 text-caption text-muted-foreground">
                  {t(`roles.${member.role}`)}
                </p>
              </div>

              <span className="text-caption text-muted-foreground">
                {t("memberBadge")}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
