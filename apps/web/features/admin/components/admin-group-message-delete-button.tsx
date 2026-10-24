"use client";

import { useConfirmDialog } from "@/components/ui/use-confirm-dialog";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
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
  const confirm = useConfirmDialog();
  const [isPending, startTransition] = useTransition();

  async function handleDelete() {
    if (isPending) return;
    const confirmed = await confirm(t("deleteMessageConfirm"), { variant: "destructive" });

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
      variant="ghost"
      size="icon"
      className="shrink-0 text-foreground hover:bg-danger/10"
      aria-label={isPending ? t("deleting") : t("delete")}
      title={isPending ? t("deleting") : t("delete")}
      aria-busy={isPending}
    >
      {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
    </Button>
  );
}
