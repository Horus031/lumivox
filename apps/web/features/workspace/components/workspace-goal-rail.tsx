import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { CreateGoalForm } from "@/features/goals/components/create-goal.form";
import type { GoalWithProgress } from "@/features/goals/goal.types";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type WorkspaceGoalRailProps = {
  goals: GoalWithProgress[];
  selectedKey: string;
};

export async function WorkspaceGoalRail({
  goals,
  selectedKey,
}: WorkspaceGoalRailProps) {
  const t = await getTranslations("workspace.rail");
  const linkClassName =
    "block shrink-0 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <aside className="min-w-0">
      <div className="rounded-[28px] border border-border/60 bg-background/80 p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2 px-2">
          <div>
            <h2 className="font-semibold text-foreground">{t("title")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <CreateGoalForm
            trigger={
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t("createGoal")}
              >
                <Plus className="h-4 w-4" />
              </Button>
            }
          />
        </div>
        <nav className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible">
          <Link
            href="/workspace?goal=all"
            aria-current={selectedKey === "all" ? "page" : undefined}
            className={cn(
              linkClassName,
              selectedKey === "all" && "bg-primary/10 text-primary",
            )}
          >
            {t("allTasks")}
          </Link>
          <Link
            href="/workspace?goal=unassigned"
            aria-current={selectedKey === "unassigned" ? "page" : undefined}
            className={cn(
              linkClassName,
              selectedKey === "unassigned" && "bg-primary/10 text-primary",
            )}
          >
            {t("unassigned")}
          </Link>
          {goals.map((goal) => {
            const selected = selectedKey === goal.id;
            return (
              <Link
                key={goal.id}
                href={`/workspace?goal=${goal.id}`}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  linkClassName,
                  "w-56 lg:w-full",
                  selected && "bg-primary/10 text-primary",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium">{goal.title}</p>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(goal.computed_progress)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${goal.computed_progress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("taskProgress", {
                      completed: goal.completed_tasks,
                      total: goal.total_tasks,
                    })}
                  </p>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
