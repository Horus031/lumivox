"use client";

import { useConfirmDialog } from "@/components/ui/use-confirm-dialog";

import { useTransition } from "react";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { adminSetLearningRoadmapArchivedAction } from "@/features/admin/admin-roadmaps.actions";
import { useRouter } from "@/i18n/navigation";

type AdminRoadmapArchiveButtonProps = {
  roadmapId: string;
  status: string;
};

export function AdminRoadmapArchiveButton({
  roadmapId,
  status,
}: AdminRoadmapArchiveButtonProps) {
  const router = useRouter();
  const t = useTranslations("admin.roadmaps.actions");
  const confirm = useConfirmDialog();
  const [isPending, startTransition] = useTransition();

  if (status === "applied") {
    return null;
  }

  const archived = status === "archived";

  async function handleClick() {
    if (isPending) return;
    const confirmed = await confirm(
      archived ? t("restoreConfirm") : t("archiveConfirm"),
    );

    if (!confirmed) return;

    startTransition(async () => {
      const result = await adminSetLearningRoadmapArchivedAction({
        roadmapId,
        archived: !archived,
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
    <Button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      variant="outline"
      size="icon"
      aria-label={label}
      title={label}
      aria-busy={isPending}
    >
      {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
    </Button>
  );
}
