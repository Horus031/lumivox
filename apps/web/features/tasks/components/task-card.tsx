"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Goal } from "@/features/goals/goal.types";
import type { TaskWithGoal } from "@/features/tasks/task.types";
import {
  deleteTaskAction,
  updateTaskAction,
} from "@/features/tasks/task.actions";
import {
  formatDisplayDate,
  toDateTimeLocalValue,
} from "@/lib/utils/date";

type TaskCardProps = {
  task: TaskWithGoal;
  goals: Goal[];
};

export function TaskCard({ task, goals }: TaskCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [goalId, setGoalId] = useState(task.goal_id ?? "");
  const [priority, setPriority] = useState<
    "low" | "medium" | "high" | "critical"
  >(task.priority);
  const [status, setStatus] = useState<
    "todo" | "in_progress" | "completed" | "overdue" | "cancelled"
  >(task.status);
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    task.estimated_minutes?.toString() ?? ""
  );
  const [dueAt, setDueAt] = useState(
    toDateTimeLocalValue(task.due_at)
  );

  function handleUpdate(event: FormEvent<HTMLFormElement>) {
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
        dueAt: dueAt ? new Date(dueAt).toISOString() : "",
        status,
        completedAt: "",
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setIsEditing(false);
      router.refresh();
    });
  }

  function handleDelete() {
    const confirmed = window.confirm("Delete this task?");

    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteTaskAction(task.id);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  if (isEditing) {
    return (
      <article className="rounded-2xl border bg-backgroud p-5 shadow-sm">
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Title
            </label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-background"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Description
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border px-3 py-2.5 outline-none transition focus:border-background"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Linked goal
              </label>
              <select
                value={goalId}
                onChange={(event) => setGoalId(event.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-background"
              >
                <option value="">No goal</option>
                {goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Priority
              </label>
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(
                    event.target.value as
                      | "low"
                      | "medium"
                      | "high"
                      | "critical"
                  )
                }
                className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-background"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Status
              </label>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value as
                      | "todo"
                      | "in_progress"
                      | "completed"
                      | "overdue"
                      | "cancelled"
                  )
                }
                className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-background"
              >
                <option value="todo">Todo</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Estimate
              </label>
              <input
                type="number"
                min={0}
                value={estimatedMinutes}
                onChange={(event) =>
                  setEstimatedMinutes(event.target.value)
                }
                className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-background"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Due time
            </label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-background"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Saving..." : "Save changes"}
            </button>

            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={isPending}
              className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article className="rounded-2xl border bg-background p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-background/10 px-2.5 py-1 text-xs font-medium capitalize">
              {task.priority}
            </span>

            <span className="rounded-full bg-background/10 px-2.5 py-1 text-xs font-medium capitalize">
              {task.status.replace("_", " ")}
            </span>
          </div>

          <h3 className="text-lg font-semibold">{task.title}</h3>

          {task.description && (
            <p className="mt-1 text-sm text-foreground">
              {task.description}
            </p>
          )}

          <div className="mt-3 space-y-1 text-sm text-foreground">
            <p>
              Goal:{" "}
              <span className="font-medium text-neutral-900">
                {task.goals?.title ?? "No goal"}
              </span>
            </p>

            <p>
              Due:{" "}
              <span className="font-medium text-neutral-900">
                {formatDisplayDate(task.due_at)}
              </span>
            </p>

            <p>
              Estimate:{" "}
              <span className="font-medium text-neutral-900">
                {task.estimated_minutes ?? 0} minutes
              </span>
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setIsEditing(true)}
            className="rounded-xl border px-3 py-2 bg-black text-sm font-medium transition hover:bg-neutral-50"
          >
            Edit
          </button>

          <button
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </article>
  );
}