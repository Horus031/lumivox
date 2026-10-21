"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { adminDeleteStudyGroupMessageAction } from "@/features/admin/admin-groups.actions";
import { Button } from "@/components/ui/button";

type AdminGroupMessageDeleteButtonProps = {
  groupId: string;
  messageId: string;
};

export function AdminGroupMessageDeleteButton({
  groupId,
  messageId,
}: AdminGroupMessageDeleteButtonProps) {
  const router = useRouter();
  const t = useTranslations("admin.groups.actions");
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const confirmed = window.confirm(t("deleteMessageConfirm"));

    if (!confirmed) return;

    startTransition(async () => {
      const result = await adminDeleteStudyGroupMessageAction({
        groupId,
        messageId,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      variant={"destructive"}
    >
      {isPending ? t("deleting") : t("delete")}
    </Button>
  );
}
