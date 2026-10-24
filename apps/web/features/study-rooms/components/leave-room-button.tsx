"use client";

import { useConfirmDialog } from "@/components/ui/use-confirm-dialog";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";

import { leaveStudyRoomAction } from "@/features/study-rooms/study-room.actions";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

type LeaveRoomButtonProps = {
  roomId: string;
  disabledForOwner?: boolean;
};

export function LeaveRoomButton({ roomId }: LeaveRoomButtonProps) {
  const router = useRouter();
  const t = useTranslations("rooms.leave");
  const confirm = useConfirmDialog();
  const [isPending, startTransition] = useTransition();

  async function handleLeave() {
    const confirmed = await confirm(t("confirm"));

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
      aria-busy={isPending}
      className="text-danger hover:bg-danger/10 hover:text-danger"
    >
      <LogOut aria-hidden="true" />
      {isPending ? t("leaving") : t("leave")}
    </Button>
  );
}
