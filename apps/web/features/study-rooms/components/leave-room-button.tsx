"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";

import { leaveStudyRoomAction } from "@/features/study-rooms/study-room.actions";
import { Button } from "@/components/ui/button";

type LeaveRoomButtonProps = {
  roomId: string;
  disabledForOwner?: boolean;
};

export function LeaveRoomButton({ roomId }: LeaveRoomButtonProps) {
  const router = useRouter();
  const t = useTranslations("rooms.leave");
  const [isPending, startTransition] = useTransition();

  function handleLeave() {
    const confirmed = window.confirm(t("confirm"));

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
      variant={"outline"}
      onClick={handleLeave}
      disabled={isPending}
      className="border border-danger/20 px-4 py-2.5 text-sm font-medium text-danger/60 transition hover:bg-danger/40 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? t("leaving") : t("leave")}
    </Button>
  );
}
