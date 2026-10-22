import { getTranslations } from "next-intl/server";

import { WorkspaceCreateGoalButton } from "./workspace-create-goal-button";
import type { GoalWithProgress } from "@/features/goals/goal.types";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { WorkspaceGoalActions } from "./workspace-goal-actions";
import { WorkspaceGoalSelector } from "./workspace-goal-selector";

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
    "block min-h-touch shrink-0 rounded-md px-2 py-2 text-label font-medium text-secondary-text transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:min-h-control";

  return (
    <aside className="min-w-0">
      <div className="min-w-0 border-b border-border pb-card lg:border-r lg:border-b-0 lg:pr-card lg:pb-0">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-section font-semibold text-foreground">{t("title")}</h2>
            <p className="mt-1 text-caption text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <WorkspaceCreateGoalButton iconOnly />
        </div>
        <WorkspaceGoalSelector goals={goals} selectedKey={selectedKey} />
        <nav aria-label={t("title")} className="hidden min-w-0 lg:block lg:space-y-1">
          <Link
            href="/workspace?goal=all"
            aria-current={selectedKey === "all" ? "page" : undefined}
            className={cn(
              linkClassName,
              selectedKey === "all" && "bg-muted text-foreground",
            )}
          >
            {t("allTasks")}
          </Link>
          <Link
            href="/workspace?goal=unassigned"
            aria-current={selectedKey === "unassigned" ? "page" : undefined}
            className={cn(
              linkClassName,
              selectedKey === "unassigned" && "bg-muted text-foreground",
            )}
          >
            {t("unassigned")}
          </Link>
          {goals.map((goal) => {
            const selected = selectedKey === goal.id;
            const progress = Math.min(100, Math.max(0, goal.computed_progress));

            return (
              <div
                key={goal.id}
                className={cn(
                  "flex w-56 shrink-0 items-start rounded-md lg:w-full",
                  selected && "bg-muted",
                )}
              >
                <Link
                  href={`/workspace?goal=${goal.id}`}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    linkClassName,

                    "min-w-0 flex-1",

                    selected && "text-foreground",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <p title={goal.title} className="min-w-0 truncate text-label font-medium">
                        {goal.title}
                      </p>

                      <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
                        {Math.round(progress)}%
                      </span>
                    </div>

                    <div role="meter" aria-label={goal.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none dark:bg-success"
                        style={{
                          width: `${progress}%`,
                        }}
                      />
                    </div>

                    <p className="mt-1 text-caption text-muted-foreground">
                      {t("taskProgress", {
                        completed: goal.completed_tasks,

                        total: goal.total_tasks,
                      })}
                    </p>
                  </div>
                </Link>

                <div className="shrink-0">
                  <WorkspaceGoalActions goal={goal} />
                </div>
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
