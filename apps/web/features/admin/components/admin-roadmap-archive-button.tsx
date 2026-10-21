"use client";

import { useTransition } from "react";
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
  const [isPending, startTransition] = useTransition();

  if (status === "applied") {
    return null;
  }

  const archived = status === "archived";

  function handleClick() {
    const confirmed = window.confirm(
      archived
        ? t("restoreConfirm")
        : t("archiveConfirm")
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

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-xl border px-3 py-2 text-sm font-medium transition hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-800 dark:hover:bg-neutral-900"
    >
      {isPending ? t("updating") : archived ? t("restore") : t("archive")}
    </button>
  );
}
