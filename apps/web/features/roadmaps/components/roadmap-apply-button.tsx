"use client";

import { useConfirmDialog } from "@/components/ui/use-confirm-dialog";

import { useTransition } from "react";
import { toast } from "sonner";

import { applyLearningRoadmapAction } from "@/features/roadmaps/roadmap.actions";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

type RoadmapApplyButtonProps = {
  roadmapId: string;
  disabled?: boolean;
};

export function RoadmapApplyButton({
  roadmapId,
  disabled = false,
}: RoadmapApplyButtonProps) {
  const router = useRouter();
  const t = useTranslations("roadmaps");
  const confirm = useConfirmDialog();
  const [isPending, startTransition] = useTransition();

  async function handleApply() {
    const confirmed = await confirm(t("applyConfirm"));

    if (!confirmed) return;

    startTransition(async () => {
      const result = await applyLearningRoadmapAction({
        roadmapId,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(
        t("applied", { goals: result.data.created_goals, tasks: result.data.created_tasks, subtasks: result.data.created_subtasks })
      );

      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      onClick={handleApply}
      disabled={disabled || isPending}
      aria-busy={isPending}
    >
      <Check aria-hidden="true" />
      {isPending ? t("applying") : t("apply")}
    </Button>
  );
}
