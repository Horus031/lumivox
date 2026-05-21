"use client";

import { useMemo, useState, Fragment } from "react";
import type React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TaskWithGoal } from "@/features/tasks/task.types";
import type { Goal } from "@/features/goals/goal.types";
import { formatDisplayDate } from "@/lib/utils/date";
import { TaskDatePicker } from "./task-date-picker";

import { updateTaskAction } from "@/features/tasks/task.actions";
import { TaskDetailsDrawer } from "./task-details-drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type TasksTableProps = {
  tasks: TaskWithGoal[];
  goals: Goal[];
};

function getStatusTone(status: TaskWithGoal["status"]) {
  if (status === "completed")
    return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/15";
  if (status === "overdue")
    return "bg-rose-500/10 text-rose-700 ring-rose-500/15";
  if (status === "in_progress")
    return "bg-sky-500/10 text-sky-700 ring-sky-500/15";
  if (status === "cancelled")
    return "bg-neutral-500/10 text-neutral-700 ring-neutral-500/15";
  return "bg-amber-500/10 text-amber-700 ring-amber-500/15";
}

function getPriorityTone(priority: TaskWithGoal["priority"]) {
  if (priority === "critical")
    return "bg-rose-500/10 text-rose-700 ring-rose-500/15";
  if (priority === "high")
    return "bg-orange-500/10 text-orange-700 ring-orange-500/15";
  if (priority === "medium")
    return "bg-sky-500/10 text-sky-700 ring-sky-500/15";
  return "bg-neutral-500/10 text-neutral-700 ring-neutral-500/15";
}

export function TasksTable({ tasks, goals }: TasksTableProps) {
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
          No tasks found
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Try a different search or filter, or create a fresh task to get
          started.
        </p>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm text-muted-foreground ring-1 ring-border/60">
          Results are paginated here.
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
        const d = new Date(task.due_at);
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
      }

      return "10:30";
    });

    async function handleUpdate(e: React.FormEvent) {
      e.preventDefault();

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
                <Label>Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-3">
                <Label>Linked goal</Label>

                <Select
                  value={goalId ?? ""}
                  onValueChange={(value) =>
                    value === "no-goal" ? setGoalId("") : setGoalId(value)
                  }
                >
                  <SelectTrigger className="w-full! h-11! border border-input bg-transparent px-3 text-sm">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="no-goal">No goal</SelectItem>
                      {/** goals prop is available in parent scope via closure */}
                      {goals?.map((g: Goal) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <label>Priority</label>
                <Select
                  value={priority}
                  onValueChange={(v) =>
                    setPriority(v as "low" | "medium" | "high" | "critical")
                  }
                >
                  <SelectTrigger className="w-full h-11 border border-input bg-transparent px-3 text-sm">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Priorities</SelectLabel>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <label>Status</label>
                <Select
                  value={status}
                  onValueChange={(v) =>
                    setStatus(
                      v as
                        | "todo"
                        | "in_progress"
                        | "completed"
                        | "overdue"
                        | "cancelled",
                    )
                  }
                >
                  <SelectTrigger className="w-full h-11 border border-input bg-transparent px-3 text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Statuses</SelectLabel>
                      <SelectItem value="todo">Todo</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <label>Estimate (minutes)</label>
                <Input
                  type="number"
                  min={0}
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(e.target.value)}
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
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingTaskId(null)}
              >
                Cancel
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
                <th className="px-5 py-4 font-semibold">Task</th>
                <th className="px-4 py-4 font-semibold">Goal</th>
                <th className="px-4 py-4 font-semibold">Priority</th>
                <th className="px-4 py-4 font-semibold">Status</th>
                <th className="px-4 py-4 font-semibold">Due</th>
                <th className="px-4 py-4 font-semibold">Estimate</th>
                <th className="px-5 py-4 font-semibold text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <Fragment key={task.id}>
                  <tr className="border-t border-border/60 transition hover:bg-muted/35">
                    <td className="px-5 py-4 align-top">
                      <button
                        type="button"
                        onClick={() => setSelectedTaskId(task.id)}
                        className="group text-left"
                      >
                        <p className="text-sm font-semibold tracking-tight text-foreground group-hover:text-primary">
                          {task.title}
                        </p>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {task.description ?? "No description available"}
                        </p>
                      </button>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">
                        {task.goals?.title ?? "No goal"}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        {task.goals?.goal_type ?? "Unlinked"}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <Badge
                        variant="secondary"
                        className={`rounded-full px-3 py-1.5 capitalize ring-1 ${getPriorityTone(
                          task.priority,
                        )}`}
                      >
                        {task.priority}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <Badge
                        variant="secondary"
                        className={`rounded-full px-3 py-1.5 capitalize ring-1 ${getStatusTone(
                          task.status,
                        )}`}
                      >
                        {task.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-foreground">
                      {formatDisplayDate(task.due_at)}
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-foreground">
                      {task.estimated_minutes
                        ? `${task.estimated_minutes}m`
                        : "—"}
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setEditingTaskId(task.id)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setSelectedTaskId(task.id)}
                          className="rounded-full bg-muted/70 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-primary hover:text-primary-foreground"
                        >
                          Open
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
