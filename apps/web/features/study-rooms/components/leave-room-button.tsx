"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { leaveStudyRoomAction } from "@/features/study-rooms/study-room.actions";
import { Button } from "@/components/ui/button";

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
    <Button
      variant={'outline'}
      onClick={handleLeave}
      disabled={isPending}
      className="rounded-xl border border-danger/20 px-4 py-2.5 text-sm font-medium text-danger/60 transition hover:bg-danger/40 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? "Leaving..." : "Leave room"}
    </Button>
  );
}
