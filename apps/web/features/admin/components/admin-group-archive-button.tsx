"use client";

import { useConfirmDialog } from "@/components/ui/use-confirm-dialog";

import { useId, useState, useTransition } from "react";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { adminSetStudyGroupArchivedAction } from "@/features/admin/admin-groups.actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type AdminGroupArchiveButtonProps = {
  groupId: string;
  archived: boolean;
  compact?: boolean;
};

export function AdminGroupArchiveButton({
  groupId,
  archived,
  compact = false,
}: AdminGroupArchiveButtonProps) {
  const router = useRouter();
  const t = useTranslations("admin.groups.actions");
  const confirm = useConfirmDialog();
  const detailT = useTranslations("admin.groups.detail");
  const id = useId();
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  async function handleClick() {
    if (isPending) return;
    const confirmed = await confirm(archived ? t("restoreConfirm") : t("archiveConfirm"));

    if (!confirmed) return;

    startTransition(async () => {
      const result = await adminSetStudyGroupArchivedAction({
        groupId,
        archived: !archived,
        adminNote: note,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  const label = isPending ? t("updating") : archived ? t("restore") : t("archive");
  return (
    <div aria-busy={isPending} className={compact ? "flex min-w-0 items-center gap-2" : "flex min-w-0 flex-col gap-2"}>
      {!archived ? (
        <div className="grid min-w-0 flex-1 gap-2">
        <Label htmlFor={id} className={compact ? "sr-only" : undefined}>{detailT("adminNote")}</Label>
        <Input
          id={id}
          maxLength={500}
          disabled={isPending}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("adminNotePlaceholder")}
        />
        </div>
      ) : null}

      <Button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        variant="outline"
        size={compact ? "icon" : "default"}
        aria-label={compact ? label : undefined}
        title={compact ? label : undefined}
      >
        {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
        {!compact && label}
      </Button>
    </div>
  );
}
