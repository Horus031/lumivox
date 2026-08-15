"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import type React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Goal } from "@/features/goals/goal.types";
import type { TaskWithGoal } from "@/features/tasks/task.types";
import { updateTaskAction } from "@/features/tasks/task.actions";
import { formatDisplayDate } from "@/lib/utils/date";
import { getPriorityTone, getStatusTone } from "@/lib/utils/color";
import { TaskDatePicker } from "./task-date-picker";
import { TaskDetailsDrawer } from "./task-details-drawer";

type TasksTableProps = {
  tasks: TaskWithGoal[];
  goals: Goal[];
};

function formatGoalType(
  goalType: string | null | undefined,
  t: ReturnType<typeof useTranslations>,
) {
  if (goalType === "short_term" || goalType === "long_term") {
    return t(`goalTypes.${goalType}`);
  }

  return t("unlinked");
}

export function TasksTable({ tasks, goals }: TasksTableProps) {
  const t = useTranslations("tasks.table");
  const formT = useTranslations("tasks.form");
  const commonT = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  if (tasks.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-border/60 bg-muted/30 p-10 text-center">
        <h3 className="text-lg font-semibold text-foreground">
          {t("emptyTitle")}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("emptyDescription")}
        </p>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm text-muted-foreground ring-1 ring-border/60">
          {t("paginatedHint")}
        </div>
      </div>
    );
  }

  function TaskRowEditor({ task }: { task: TaskWithGoal }) {
    const [title, setTitle] = useState(task.title);
    const [description] = useState(task.description ?? "");
    const [goalId, setGoalId] = useState(task.goal_id ?? "");
    const [priority, setPriority] = useState<
      "low" | "medium" | "high" | "critical"
    >(task.priority);
    const [status, setStatus] = useState<
      "todo" | "in_progress" | "completed" | "overdue" | "cancelled"
    >(task.status);
    const [estimatedMinutes, setEstimatedMinutes] = useState(
      task.estimated_minutes?.toString() ?? "",
    );
    const [dueAt, setDueAt] = useState<Date | undefined>(
      task.due_at ? new Date(task.due_at) : undefined,
    );
    const [dueTime, setDueTime] = useState(() => {
      if (task.due_at) {
        const date = new Date(task.due_at);
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        return `${hours}:${minutes}`;
      }

      return "10:30";
    });

    async function handleUpdate(event: React.FormEvent) {
      event.preventDefault();

      startTransition(async () => {
        const result = await updateTaskAction({
          taskId: task.id,
          title,
          description,
          goalId,
          priority,
          estimatedMinutes:
            estimatedMinutes.trim() === ""
              ? undefined
              : Number(estimatedMinutes),
          dueAt: dueAt ? dueAt.toISOString() : "",
          status,
          completedAt: "",
        });

        if (!result.success) {
          toast.error(result.message);
          return;
        }

        toast.success(result.message);
        setEditingTaskId(null);
        router.refresh();
      });
    }

    return (
      <tr className="bg-muted/10">
        <td colSpan={7} className="px-5 py-4">
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-3">
                <Label>{formT("fields.title")}</Label>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-3">
                <Label>{formT("fields.linkedGoal")}</Label>

                <Select
                  value={goalId ?? ""}
                  onValueChange={(value) =>
                    value === "no-goal" ? setGoalId("") : setGoalId(value)
                  }
                >
                  <SelectTrigger className="w-full! h-11! border border-input bg-transparent px-3 text-sm">
                    <SelectValue placeholder={formT("fields.linkedGoal")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="no-goal">{formT("noGoal")}</SelectItem>
                      {goals.map((goal) => (
                        <SelectItem key={goal.id} value={goal.id}>
                          {goal.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>{formT("fields.priority")}</Label>
                <Select
                  value={priority}
                  onValueChange={(value) =>
                    setPriority(
                      value as "low" | "medium" | "high" | "critical",
                    )
                  }
                >
                  <SelectTrigger className="h-11 w-full border border-input bg-transparent px-3 text-sm">
                    <SelectValue placeholder={formT("fields.priority")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>{formT("fields.priority")}</SelectLabel>
                      <SelectItem value="low">
                        {formT("priorities.low")}
                      </SelectItem>
                      <SelectItem value="medium">
                        {formT("priorities.medium")}
                      </SelectItem>
                      <SelectItem value="high">
                        {formT("priorities.high")}
                      </SelectItem>
                      <SelectItem value="critical">
                        {formT("priorities.critical")}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>{formT("fields.status")}</Label>
                <Select
                  value={status}
                  onValueChange={(value) =>
                    setStatus(
                      value as
                        | "todo"
                        | "in_progress"
                        | "completed"
                        | "overdue"
                        | "cancelled",
                    )
                  }
                >
                  <SelectTrigger className="h-11 w-full border border-input bg-transparent px-3 text-sm">
                    <SelectValue placeholder={formT("fields.status")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>{formT("fields.status")}</SelectLabel>
                      <SelectItem value="todo">
                        {formT("statuses.todo")}
                      </SelectItem>
                      <SelectItem value="in_progress">
                        {formT("statuses.in_progress")}
                      </SelectItem>
                      <SelectItem value="completed">
                        {formT("statuses.completed")}
                      </SelectItem>
                      <SelectItem value="overdue">
                        {formT("statuses.overdue")}
                      </SelectItem>
                      <SelectItem value="cancelled">
                        {formT("statuses.cancelled")}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <Label>{formT("fields.estimatedMinutes")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={estimatedMinutes}
                  onChange={(event) => setEstimatedMinutes(event.target.value)}
                />
              </div>

              <div className="space-y-3">
                <TaskDatePicker
                  dueAt={dueAt}
                  setDueAt={setDueAt}
                  dueTime={dueTime}
                  setDueTime={setDueTime}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                {commonT("save")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingTaskId(null)}
              >
                {commonT("cancel")}
              </Button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-[28px] border border-border/60 bg-background">
        <div className="overflow-x-auto">
          <table className="min-w-230 w-full border-collapse">
            <thead className="bg-muted/45 text-left text-xs uppercase tracking-[0.22em] text-muted-foreground">
              <tr>
                <th className="px-5 py-4 font-semibold">{t("headers.task")}</th>
                <th className="px-4 py-4 font-semibold">{t("headers.goal")}</th>
                <th className="px-4 py-4 font-semibold">
                  {t("headers.priority")}
                </th>
                <th className="px-4 py-4 font-semibold">
                  {t("headers.status")}
                </th>
                <th className="px-4 py-4 font-semibold">{t("headers.due")}</th>
                <th className="px-4 py-4 font-semibold">
                  {t("headers.estimate")}
                </th>
                <th className="px-5 py-4 text-right font-semibold">
                  {t("headers.details")}
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <Fragment key={task.id}>
                  <tr className="border-t border-border/60 transition hover:bg-muted/35">
                    <td className="max-w-56 px-5 py-4 align-top">
                      <button
                        type="button"
                        onClick={() => setSelectedTaskId(task.id)}
                        className="group text-left"
                      >
                        <p className="text-sm font-semibold tracking-tight text-foreground group-hover:text-primary">
                          {task.title}
                        </p>
                        <p className="mt-1 line-clamp-2 truncate text-wrap text-sm text-muted-foreground">
                          {task.description ?? t("noDescription")}
                        </p>
                      </button>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">
                        {task.goals?.title ?? formT("noGoal")}
                      </p>
                      <p className="mt-1 text-xs capitalize tracking-[0.18em] text-muted-foreground">
                        {formatGoalType(task.goals?.goal_type, formT)}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <Badge
                        variant="secondary"
                        className={`rounded-full px-3 py-1.5 capitalize ring-1 ${getPriorityTone(
                          task.priority,
                        )}`}
                      >
                        {formT(`priorities.${task.priority}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <Badge
                        variant="secondary"
                        className={`rounded-full px-3 py-1.5 capitalize ring-1 ${getStatusTone(
                          task.status,
                        )}`}
                      >
                        {formT(`statuses.${task.status}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-foreground">
                      {formatDisplayDate(task.due_at)}
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-foreground">
                      {task.estimated_minutes
                        ? t("minutesShort", { minutes: task.estimated_minutes })
                        : "-"}
                    </td>
                    <td className="px-5 py-4 text-right align-top">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setEditingTaskId(task.id)}
                        >
                          {commonT("edit")}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setSelectedTaskId(task.id)}
                          className="rounded-full bg-muted/70 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-primary hover:text-primary-foreground"
                        >
                          {t("open")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {editingTaskId === task.id ? (
                    <TaskRowEditor key={`${task.id}-editor`} task={task} />
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <TaskDetailsDrawer
        task={selectedTask}
        onClose={() => setSelectedTaskId(null)}
      />
    </>
  );
}
