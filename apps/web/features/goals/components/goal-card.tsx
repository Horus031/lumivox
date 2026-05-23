"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Goal } from "@/features/goals/goal.types";
import { deleteGoalAction } from "@/features/goals/goal.actions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CreateGoalForm } from "./create-goal.form";

type GoalCardProps = {
  goal: Goal;
};

export function GoalCard({ goal }: GoalCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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

  return (
    <article className="rounded-2xl border bg-background text-foreground p-5 shadow-sm lg:min-h-90 xl:min-h-0">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-surface text-foreground px-2.5 py-1 text-xs font-medium">
              {goal.goal_type === "short_term" ? "Short term" : "Long term"}
            </span>

            <span className="rounded-full bg-surface text-foreground px-2.5 py-1 text-xs font-medium capitalize">
              {goal.status}
            </span>
          </div>

          <h3 className="text-lg font-semibold">{goal.title}</h3>

          {goal.description && (
            <p className="mt-1 text-sm text-neutral-600">{goal.description}</p>
          )}
        </div>

        <div className="flex gap-2">
          <CreateGoalForm
            mode="edit"
            goal={goal}
            trigger={
              <Button
                variant={"outline"}
                className="border px-3 py-2 text-sm font-medium transition bg-transparent"
              >
                Edit
              </Button>
            }
          />

          <Button
            variant={"outline"}
            onClick={handleDelete}
            disabled={isPending}
            className="border border-danger/20 px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-foreground">Progress</span>
          <span className="font-medium">{goal.progress_percent}%</span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
          <Progress className="bg-primary/20" value={goal.progress_percent} />

          {/* <div
            className="h-full rounded-full bg-neutral-900 transition-all"
            style={{ width: `${goal.progress_percent}%` }}
          /> */}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-foreground md:grid-cols-2">
        <p>Start: {goal.start_date ?? "Not set"}</p>
        <p>Target: {goal.target_date ?? "Not set"}</p>
      </div>
    </article>
  );
}
