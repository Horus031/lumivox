"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { leaveStudyRoomAction } from "@/features/study-rooms/study-room.actions";

type LeaveRoomButtonProps = {
  roomId: string;
  disabledForOwner?: boolean;
};

export function LeaveRoomButton({
  roomId,
  disabledForOwner = false,
}: LeaveRoomButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLeave() {
    if (disabledForOwner) {
      toast.error("Room owners cannot leave directly.");
      return;
    }

    const confirmed = window.confirm("Leave this study room?");

    if (!confirmed) return;

    startTransition(async () => {
      window.dispatchEvent(
        new CustomEvent("lumivox:leave-study-room", {
          detail: {
            roomId,
          },
        }),
      );

      // Give Presence a brief moment to broadcast the leave event
      // before the route changes and the component unmounts.
      await new Promise((resolve) => setTimeout(resolve, 600));

      const result = await leaveStudyRoomAction(roomId);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.push("/rooms");
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleLeave}
      disabled={isPending}
      className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? "Leaving..." : "Leave room"}
    </button>
  );
}
