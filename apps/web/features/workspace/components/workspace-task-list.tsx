"use client";

import { useId } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskRiskIndicator } from "@/features/native-task-risk/components/task-risk-indicator";
import { isTaskStatus, TASK_BOARD_LANES } from "@/features/tasks/task-status";
import { getTaskBoardStatus } from "@/features/tasks/task-transition";
import { Link, useRouter } from "@/i18n/navigation";
import { getPriorityTone, getStatusTone } from "@/lib/utils/color";
import type { WorkspaceListOptions, WorkspaceListTask } from "../workspace.types";
import { workspaceHref, workspaceViewParams } from "../workspace.utils";
import { useWorkspaceTaskDetails } from "./workspace-task-details";

export function WorkspaceTaskList({ goal, options, tasks, totalPages, referenceNow }: {
  goal: string;
  options: WorkspaceListOptions;
  tasks: WorkspaceListTask[];
  totalPages: number;
  referenceNow: string;
}) {
  const t = useTranslations("workspace.list");
  const taskT = useTranslations("tasks.form");
  const format = useFormatter();
  const router = useRouter();
  const statusId = useId();
  const { onTaskLinkClick, riskForTask } = useWorkspaceTaskDetails();
  const now = new Date(referenceNow);
  const asc = options.sort === "asc";
  const SortIcon = asc ? ArrowUp : ArrowDown;

  return (
    <div className="min-w-0 space-y-card">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={statusId} className="text-label font-medium">{t("status")}</label>
        <Select value={options.status ?? "all"} onValueChange={(value) => {
          const status = isTaskStatus(value) ? value : undefined;
          router.push(workspaceHref(goal, "list", { ...options, status, page: 1 }), { scroll: false });
        }}>
          <SelectTrigger id={statusId} className="min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            {TASK_BOARD_LANES.map((status) => (
              <SelectItem key={status} value={status}>{taskT(`statuses.${status}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-lg border border-border">
        <table aria-label={t("title")} className="w-full border-collapse text-left text-body">
          <thead className="bg-muted/60 text-caption text-muted-foreground">
            <tr>
              <th scope="col" className="min-w-32 px-2 py-2 font-medium sm:px-4">{t("task")}</th>
              <th scope="col" className="px-2 py-2 font-medium sm:px-4">{t("status")}</th>
              <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">{t("priority")}</th>
              <th scope="col" aria-sort={asc ? "ascending" : "descending"} className="px-2 py-2 font-medium sm:px-4">
                <Link
                  href={workspaceHref(goal, "list", { ...options, sort: asc ? "desc" : "asc", page: 1 })}
                  prefetch={false}
                  scroll={false}
                  className="inline-flex min-h-control items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t(asc ? "sortLatest" : "sortEarliest")}
                >
                  {t("due")}
                  <SortIcon aria-hidden="true" className="size-3.5" />
                </Link>
              </th>
              <th scope="col" className="hidden px-4 py-2 font-medium xl:table-cell">{t("subtasks")}</th>
              <th scope="col" className="px-2 py-2 font-medium whitespace-nowrap sm:px-4">{t("createdAt")}</th>
              <th scope="col" className="px-2 py-2 font-medium whitespace-nowrap sm:px-4">{t("updatedAt")}</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const status = getTaskBoardStatus(task, now);
              return (
                <tr key={task.id} className="relative border-t border-border hover:bg-muted/50 focus-within:bg-muted/50">
                  <th scope="row" className="px-2 py-3 text-left font-medium sm:px-4">
                    <Link
                      href={workspaceHref(goal, "list", options, task.id)}
                      prefetch={false}
                      scroll={false}
                      onClick={(event) => {
                        if (!event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                          onTaskLinkClick(task.id, event.currentTarget);
                        }
                      }}
                      className="wrap-anywhere after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                    >
                      {task.title}
                    </Link>
                    <div className="mt-1 empty:hidden"><TaskRiskIndicator state={riskForTask(task)} /></div>
                  </th>
                  <td className="px-2 py-3 sm:px-4">
                    <Badge variant="outline" className={getStatusTone(status)}>{taskT(`statuses.${status}`)}</Badge>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <Badge variant="outline" className={getPriorityTone(task.priority)}>{taskT(`priorities.${task.priority}`)}</Badge>
                  </td>
                  <td className="px-2 py-3 text-caption text-muted-foreground sm:px-4 sm:text-body">
                    {task.due_at ? (
                      <time dateTime={task.due_at}>{format.dateTime(new Date(task.due_at), { dateStyle: "medium" })}</time>
                    ) : (
                      <span aria-label={t("noDue")}>—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground tabular-nums xl:table-cell">
                    {task.totalSubtasks > 0 ? (
                      <span aria-label={t("subtaskProgress", { completed: task.completedSubtasks, total: task.totalSubtasks })}>
                        {task.completedSubtasks}/{task.totalSubtasks}
                      </span>
                    ) : "—"}
                  </td>
                  {[task.created_at, task.updated_at].map((timestamp, index) => (
                    <td key={index} className="px-2 py-3 text-caption whitespace-nowrap tabular-nums sm:px-4">
                      <time dateTime={timestamp}>
                        <span className="block">{format.dateTime(new Date(timestamp), { dateStyle: "medium" })}</span>
                        <span className="block text-muted-foreground">{format.dateTime(new Date(timestamp), { timeStyle: "short" })}</span>
                      </time>
                    </td>
                  ))}
                </tr>
              );
            })}
            {tasks.length === 0 && (
              <tr className="border-t border-border">
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  {t(options.status ? "noMatches" : "empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <DataTablePagination
          basePath="/workspace"
          page={options.page}
          searchParams={workspaceViewParams(goal, "list", options)}
          totalPages={totalPages}
          prefetch={false}
        />
      )}
    </div>
  );
}
