"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Goal } from "@/features/goals/goal.types";
import { createTaskAction } from "@/features/tasks/task.actions";

type CreateTaskFormProps = {
  goals: Goal[];
};

export function CreateTaskForm({ goals }: CreateTaskFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalId, setGoalId] = useState("");
  const [priority, setPriority] = useState<
    "low" | "medium" | "high" | "critical"
  >("medium");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [dueAt, setDueAt] = useState("");

  function resetForm() {
    setTitle("");
    setDescription("");
    setGoalId("");
    setPriority("medium");
    setEstimatedMinutes("");
    setDueAt("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await createTaskAction({
        title,
        description,
        goalId,
        priority,
        estimatedMinutes:
          estimatedMinutes.trim() === "" ? undefined : Number(estimatedMinutes),
        dueAt: dueAt ? new Date(dueAt).toISOString() : "",
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      resetForm();
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xl font-semibold">Create a new task</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Tasks are the behavioural events Lumivox will later analyse.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Task title</label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Finish the Literature Review draft"
            className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
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
            placeholder="Optional notes or execution details"
            className="w-full resize-none rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
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
              className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
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
            <label className="mb-1.5 block text-sm font-medium">Priority</label>
            <select
              value={priority}
              onChange={(event) =>
                setPriority(
                  event.target.value as "low" | "medium" | "high" | "critical",
                )
              }
              className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Estimated minutes
            </label>
            <input
              type="number"
              min={0}
              value={estimatedMinutes}
              onChange={(event) => setEstimatedMinutes(event.target.value)}
              placeholder="90"
              className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Due time</label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Creating..." : "Create task"}
        </button>
      </form>
    </section>
  );
}
