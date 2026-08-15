"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { adminSetStudyGroupArchivedAction } from "@/features/admin/admin-groups.actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type AdminGroupArchiveButtonProps = {
  groupId: string;
  archived: boolean;
};

export function AdminGroupArchiveButton({
  groupId,
  archived,
}: AdminGroupArchiveButtonProps) {
  const router = useRouter();
  const t = useTranslations("admin.groups.actions");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const confirmed = window.confirm(
      archived ? t("restoreConfirm") : t("archiveConfirm")
    );

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

  return (
    <div className="flex flex-col gap-2">
      {!archived ? (
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("adminNotePlaceholder")}
        />
      ) : null}

      <Button
        type="button"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? t("updating") : archived ? t("restore") : t("archive")}
      </Button>
    </div>
  );
}
