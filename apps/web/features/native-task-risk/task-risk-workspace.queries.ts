import { requireUser } from "@/lib/auth/require-user";
import type { TypedSupabaseClient } from "@/types/supabase.types";
import type { WorkspaceTask } from "@/features/workspace/workspace.types";

import type { TaskRiskViewState } from "./task-risk-presentation.types";
import {
  isTaskRiskEligible,
  resolveTaskRiskSnapshot,
  type TaskRiskSnapshotRow,
} from "./task-risk-snapshot.adapter";

const BATCH_SIZE = 100;

export type WorkspaceTaskRiskMap = Record<string, TaskRiskViewState>;

type QueryOptions = {
  supabase?: TypedSupabaseClient;
  now?: Date;
};

export async function getWorkspaceTaskRiskStates(
  tasks: readonly WorkspaceTask[],
  options: QueryOptions = {},
): Promise<WorkspaceTaskRiskMap> {
  const now = options.now ?? new Date();

  const taskById = new Map(tasks.map((task) => [task.id, task]));

  const states: WorkspaceTaskRiskMap = {};

  for (const task of tasks) {
    states[task.id] = resolveTaskRiskSnapshot(task, undefined, now);
  }

  const eligibleIds = [
    ...new Set(
      tasks
        .filter((task) => isTaskRiskEligible(task, now))
        .map((task) => task.id),
    ),
  ];

  if (eligibleIds.length === 0) {
    return states;
  }

  const supabase = options.supabase ?? (await requireUser()).supabase;

  const allowedIds = new Set(eligibleIds);

  for (let offset = 0; offset < eligibleIds.length; offset += BATCH_SIZE) {
    const batch = eligibleIds.slice(offset, offset + BATCH_SIZE);

    const { data, error } = await supabase.rpc(
      "get_my_native_task_risk_snapshots_for_tasks",
      {
        p_task_ids: batch,
      },
    );

    if (error) {
      throw new Error(`Failed to load task risk snapshots: ${error.message}`);
    }

    const rows = (data ?? []) as TaskRiskSnapshotRow[];

    for (const row of rows) {
      if (!allowedIds.has(row.task_id)) {
        continue;
      }

      const task = taskById.get(row.task_id);

      if (!task) {
        continue;
      }

      states[task.id] = resolveTaskRiskSnapshot(task, row, now);
    }
  }

  return states;
}
