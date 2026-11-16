"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { NativeTaskRiskRecommendedAction } from "@/features/native-task-risk/native-task-risk.types";

type NativeTaskRiskActionButtonsProps = {
  taskId: string;
  actions: NativeTaskRiskRecommendedAction[];
};

export function NativeTaskRiskActionButtons({
  taskId,
  actions,
}: NativeTaskRiskActionButtonsProps) {
  const t = useTranslations("taskRiskRecovery.actions.label");

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
          return (
            <Link
              key={action.action_id}
              href={`/workspace?task=${taskId}&tab=overview&edit=1`}
              className="rounded-xl border px-4 py-2 text-sm font-medium"
            >
              {t("reschedule")}
            </Link>
          );
        }

        if (action.action_type === "split_task") {
          return (
            <Link
              key={action.action_id}
              href={`/workspace?task=${taskId}&tab=subtasks`}
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
              href={`/workspace?task=${taskId}&tab=overview&edit=1`}
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
