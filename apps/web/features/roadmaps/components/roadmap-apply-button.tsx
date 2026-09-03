"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { applyLearningRoadmapAction } from "@/features/roadmaps/roadmap.actions";
import { useRouter } from "@/i18n/navigation";

type RoadmapApplyButtonProps = {
  roadmapId: string;
  disabled?: boolean;
};

export function RoadmapApplyButton({
  roadmapId,
  disabled = false,
}: RoadmapApplyButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleApply() {
    const confirmed = window.confirm(
      "Apply this roadmap? Lumivox will create goals, tasks, and subtasks from the current roadmap tree. This action cannot be repeated."
    );

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
        `Roadmap applied: ${result.data.created_goals} goals, ${result.data.created_tasks} tasks, ${result.data.created_subtasks} subtasks created.`
      );

      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleApply}
      disabled={disabled || isPending}
      className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? "Applying..." : "Apply roadmap"}
    </button>
  );
}