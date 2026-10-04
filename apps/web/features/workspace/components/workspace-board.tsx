"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { TaskDetailsDrawer } from "@/features/tasks/components/task-details-drawer";
import { TASK_BOARD_LANES } from "@/features/tasks/task-status";

import type { WorkspaceTask } from "../workspace.types";
import { groupWorkspaceTasksByStatus } from "../workspace.utils";
import { WorkspaceLane } from "./workspace-lane";

type WorkspaceBoardProps = {
  tasks: WorkspaceTask[];
};

export function WorkspaceBoard({ tasks }: WorkspaceBoardProps) {
  const taskT = useTranslations("tasks.form");
  const [selectedTask, setSelectedTask] = useState<WorkspaceTask | null>(null);

  const groupedTasks = useMemo(
    () => groupWorkspaceTasksByStatus(tasks),
    [tasks],
  );

  return (
    <>
      <div className="min-w-0 overflow-hidden">
        <div className="flex gap-4 overflow-x-auto pb-4">
          {TASK_BOARD_LANES.map((status) => (
            <WorkspaceLane
              key={status}
              status={status}
              label={taskT(`statuses.${status}`)}
              tasks={groupedTasks[status]}
              onOpenTask={setSelectedTask}
            />
          ))}
        </div>
      </div>

      <TaskDetailsDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </>
  );
}
