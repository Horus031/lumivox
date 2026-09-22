"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Link, useRouter } from "@/i18n/navigation";
import { rescheduleTaskFromRiskAlertAction } from "@/features/native-task-risk/native-task-risk.actions";
import type { NativeTaskRiskRecommendedAction } from "@/features/native-task-risk/native-task-risk.types";

type NativeTaskRiskActionButtonsProps = {
  taskId: string;
  actions: NativeTaskRiskRecommendedAction[];
};

export function NativeTaskRiskActionButtons({
  taskId,
  actions,
}: NativeTaskRiskActionButtonsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleReschedule(daysToAdd: number) {
    startTransition(async () => {
      const result = await rescheduleTaskFromRiskAlertAction({
        taskId,
        daysToAdd,
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
    <div className="mt-4 flex flex-wrap gap-2">
      {actions.map((action) => {
        if (action.action_type === "start_focus") {
          return (
            <Link
              key={action.action_id}
              href={`/focus?taskId=${taskId}`}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              {action.label}
            </Link>
          );
        }

        if (action.action_type === "reschedule") {
          const daysToAdd =
            typeof action.payload.days_to_add === "number"
              ? action.payload.days_to_add
              : 1;

          return (
            <button
              key={action.action_id}
              type="button"
              disabled={isPending}
              onClick={() => handleReschedule(daysToAdd)}
              className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-800 dark:hover:bg-neutral-900"
            >
              {isPending ? "Updating..." : action.label}
            </button>
          );
        }

        if (action.action_type === "split_task") {
          return (
            <Link
              key={action.action_id}
              href={`/tasks?parentTaskId=${taskId}&action=create-subtask`}
              className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
            >
              {action.label}
            </Link>
          );
        }

        if (action.action_type === "reduce_scope") {
          return (
            <Link
              key={action.action_id}
              href={`/tasks?taskId=${taskId}&action=edit`}
              className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
            >
              {action.label}
            </Link>
          );
        }

        return (
          <Link
            key={action.action_id}
            href={`/tasks?taskId=${taskId}`}
            className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            {action.label}
          </Link>
        );
      })}
    </div>
  );
}