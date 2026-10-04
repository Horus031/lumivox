"use client";

import { useTranslations } from "next-intl";

import type { TaskStatus } from "@/features/tasks/task-status";
import type { WorkspaceTask } from "../workspace.types";
import { WorkspaceTaskCard } from "./workspace-task-card";

type WorkspaceLaneProps = {
  status: TaskStatus;
  label: string;
  tasks: WorkspaceTask[];
  onOpenTask: (task: WorkspaceTask) => void;
};

export function WorkspaceLane({
  status,
  label,
  tasks,
  onOpenTask,
}: WorkspaceLaneProps) {
  const t = useTranslations("workspace.board");

  return (
    <section
      data-status={status}
      className="flex h-fit min-h-56 w-[18rem] shrink-0 flex-col rounded-[28px] border border-border/60 bg-muted/30 p-3 xl:w-76"
    >
      <header className="mb-3 flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>

        <span className="rounded-full bg-background px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border/60">
          {tasks.length}
        </span>
      </header>

      <div className="space-y-3">
        {tasks.length ? (
          tasks.map((task) => (
            <WorkspaceTaskCard key={task.id} task={task} onOpen={onOpenTask} />
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
            {t("empty")}
          </div>
        )}
      </div>
    </section>
  );
}
