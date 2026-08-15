"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { GoalWithProgress } from "@/features/goals/goal.types";
import { deleteGoalAction } from "@/features/goals/goal.actions";
import { Button } from "@/components/ui/button";
import { CreateGoalForm } from "./create-goal.form";
import { GoalProgressBar } from "./goal-progress-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EllipsisIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type GoalCardProps = {
  goal: GoalWithProgress;
};

export function GoalCard({ goal }: GoalCardProps) {
  const t = useTranslations("goals.card");
  const formT = useTranslations("goals.form");
  const commonT = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const confirmed = window.confirm(t("deleteConfirm"));

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
    <article className="rounded-2xl flex flex-col gap-2 justify-between border bg-background text-foreground p-5 shadow-sm lg:min-h-96 xl:min-h-0">
      <div className="flex flex-col justify-between gap-4 md:items-start">
        <div className="flex w-full justify-between items-center">
          <div className="gap-2 flex items-center">
            <span className="rounded-full bg-surface text-foreground px-2.5 py-1 text-xs font-medium">
              {formT(`goalTypes.${goal.goal_type}`)}
            </span>

            <span className="rounded-full bg-surface text-foreground px-2.5 py-1 text-xs font-medium capitalize">
              {formT(`statuses.${goal.status}`)}
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span className="p-2 rounded-full hover:bg-foreground/40 cursor-pointer">
                <EllipsisIcon />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup className="flex flex-col">
                <CreateGoalForm
                  mode="edit"
                  goal={goal}
                  trigger={
                    <Button
                      variant={"outline"}
                      className="border-0 px-3 py-2 text-sm font-medium transition bg-transparent hover:text-primary-foreground"
                    >
                      {commonT("edit")}
                    </Button>
                  }
                />
                <Button
                  variant={"outline"}
                  onClick={handleDelete}
                  disabled={isPending}
                  className="border-0 border-danger/20 px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? t("deleting") : commonT("delete")}
                </Button>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div>
          <div className="mb-2 flex flex-wrap gap-2"></div>

          <h3 className="text-lg font-semibold">{goal.title}</h3>

          {goal.description ? (
            <p className="mt-1 text-sm text-neutral-600">{goal.description}</p>
          ) : (
            <p className="mt-1 text-sm text-neutral-600">
              {t("noDescription")}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col">
        <div className="mt-5">
          <GoalProgressBar
            totalTasks={goal.total_tasks}
            completedTasks={goal.completed_tasks}
          />

          {/* <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
          <Progress className="bg-primary/20" value={goal.progress_percent} />

          <div
            className="h-full rounded-full bg-neutral-900 transition-all"
            style={{ width: `${goal.progress_percent}%` }}
          />
        </div> */}
        </div>

        <div className="mt-4 grid gap-2 text-sm text-foreground md:grid-cols-2">
          <p>
            {t("start")}: {goal.start_date ?? t("notSet")}
          </p>
          <p>
            {t("target")}: {goal.target_date ?? t("notSet")}
          </p>
        </div>

        <Link
          href={`/goals/${goal.id}`}
          className="border rounded-md text-center mt-4 px-4 py-2 text-sm font-medium transition bg-background hover:bg-primary hover:text-primary-foreground"
        >
          {t("viewDocuments")}
        </Link>
      </div>
    </article>
  );
}
