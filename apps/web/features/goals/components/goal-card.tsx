"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Goal } from "@/features/goals/goal.types";
import {
  deleteGoalAction,
  updateGoalAction,
} from "@/features/goals/goal.actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type GoalCardProps = {
  goal: Goal;
};

export function GoalCard({ goal }: GoalCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);

  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description ?? "");
  const [goalType, setGoalType] = useState<"short_term" | "long_term">(
    goal.goal_type,
  );
  const [status, setStatus] = useState<
    "active" | "completed" | "paused" | "archived"
  >(goal.status);
  const [progressPercent, setProgressPercent] = useState(
    Number(goal.progress_percent),
  );
  const [startDate, setStartDate] = useState(goal.start_date ?? "");
  const [targetDate, setTargetDate] = useState(goal.target_date ?? "");

  function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await updateGoalAction({
        goalId: goal.id,
        title,
        description,
        goalType,
        status,
        progressPercent,
        startDate,
        targetDate,
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
    const confirmed = window.confirm(
      "Delete this goal? Tasks linked to it will remain, but their goal reference will be removed.",
    );

    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteGoalAction(goal.id);

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
      <article className="rounded-2xl border bg-white p-5 shadow-sm">
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Title</label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
            {/* <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
              required
            /> */}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
            {/* <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
            /> */}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Goal type
              </label>

              <Select
                value={goalType ?? ""}
                onValueChange={(value) =>
                  setGoalType(value as "short_term" | "long_term")
                }
              >
                <SelectTrigger className="flex w-full h-11! rounded-xl border border-input bg-transparent px-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring">
                  <SelectValue placeholder="Goal type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Goal type</SelectLabel>
                    <SelectItem value="short_term">Short term</SelectItem>
                    <SelectItem value="long_term">Long term</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              {/* <select
                value={goalType}
                onChange={(event) =>
                  setGoalType(event.target.value as "short_term" | "long_term")
                }
                className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
              >
                <option value="short_term">Short term</option>
                <option value="long_term">Long term</option>
              </select> */}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Status</label>

              <Select
                value={status ?? ""}
                onValueChange={(value) =>
                  setStatus(
                    value as "active" | "completed" | "paused" | "archived",
                  )
                }
              >
                <SelectTrigger className="flex w-full h-11! rounded-xl border border-input bg-transparent px-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Statuses</SelectLabel>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              {/* <select
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value as
                      | "active"
                      | "completed"
                      | "paused"
                      | "archived",
                  )
                }
                className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select> */}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Start date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Target date
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Progress: {progressPercent}%
            </label>
            <Slider
              value={[progressPercent]}
              onChange={(value) => setProgressPercent(Number(value))}
              min={0}
              max={100}
              step={1}
              className="mx-auto w-full"
            />
            {/* <input
              type="range"
              min={0}
              max={100}
              value={progressPercent}
              onChange={(event) =>
                setProgressPercent(Number(event.target.value))
              }
              className="w-full"
            /> */}
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            <Button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white transition  disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Saving..." : "Save changes"}
            </Button>

            <Button
              variant={"outline"}
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={isPending}
              className="border px-4 py-2 text-sm font-medium transition bg-transparent hover:bg-black/10"
            >
              Cancel
            </Button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm lg:min-h-90 xl:min-h-0">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium">
              {goal.goal_type === "short_term" ? "Short term" : "Long term"}
            </span>

            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium capitalize">
              {goal.status}
            </span>
          </div>

          <h3 className="text-lg font-semibold">{goal.title}</h3>

          {goal.description && (
            <p className="mt-1 text-sm text-neutral-600">{goal.description}</p>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant={"outline"}
            onClick={() => setIsEditing(true)}
            className="border px-3 py-2 text-sm font-medium transition bg-transparent"
          >
            Edit
          </Button>

          <Button
            variant={"outline"}
            onClick={handleDelete}
            disabled={isPending}
            className="border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-neutral-600">Progress</span>
          <span className="font-medium">{goal.progress_percent}%</span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
          <Progress value={goal.progress_percent} />

          {/* <div
            className="h-full rounded-full bg-neutral-900 transition-all"
            style={{ width: `${goal.progress_percent}%` }}
          /> */}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-neutral-600 md:grid-cols-2">
        <p>Start: {goal.start_date ?? "Not set"}</p>
        <p>Target: {goal.target_date ?? "Not set"}</p>
      </div>
    </article>
  );
}
