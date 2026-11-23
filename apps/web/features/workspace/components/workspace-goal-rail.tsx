"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { GoalPageSearch } from "@/features/goals/components/goal-page-search";
import type { GoalOption, GoalPage } from "@/features/goals/goal.types";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { WorkspaceCreateGoalButton } from "./workspace-create-goal-button";
import { WorkspaceGoalActions } from "./workspace-goal-actions";
import { workspaceHref } from "../workspace.utils";
import type { WorkspaceView } from "../workspace.types";

export function WorkspaceGoalRail({ initialPage, selectedGoal, unassigned, view }: {
  initialPage: GoalPage;
  selectedGoal: GoalOption | null;
  unassigned: boolean;
  view: WorkspaceView;
}) {
  const t = useTranslations("workspace.rail");
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const selectionLabel = selectedGoal?.title ?? (unassigned ? t("unassigned") : t("chooseGoal"));
  const linkClass = "block min-h-touch rounded-md px-2 py-2 text-label font-medium text-secondary-text hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:min-h-control";

  return (
    <aside className="min-w-0 border-b border-border pb-card lg:border-r lg:border-b-0 lg:pr-card lg:pb-0">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <h2 className="hidden text-section font-semibold lg:block">{t("title")}</h2>
        <Button type="button" variant="outline" className="min-w-0 flex-1 justify-between lg:hidden" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded((value) => !value)}>
          <span className="truncate">{selectionLabel}</span>
          <ChevronDown aria-hidden="true" className={cn("size-4", expanded && "rotate-180")} />
        </Button>
        <WorkspaceCreateGoalButton />
      </div>
      <nav id={listId} aria-label={t("title")} className={cn("space-y-2 lg:block", !expanded && "hidden")}>
        <GoalPageSearch initialPage={initialPage} includeProgress renderItem={(goal) => {
          const selected = selectedGoal?.id === goal.id;
          const completed = goal.completed_tasks ?? 0;
          const total = goal.total_tasks ?? 0;
          const progress = total ? Math.round((100 * completed) / total) : 0;

          return (
            <div className="group relative">
              <Link href={workspaceHref(goal.id, view)} prefetch={false} onClick={() => setExpanded(false)}
                aria-current={selected ? "page" : undefined} className={cn(linkClass, "pe-12 sm:pe-10", selected && "bg-muted text-foreground")}>
                <div className="flex items-center gap-2">
                  <span title={goal.title} className="min-w-0 flex-1 truncate">{goal.title}</span>
                  <span className="shrink-0 text-caption text-muted-foreground tabular-nums">{progress}%</span>
                </div>
                <div role="meter" aria-label={t("taskProgress", { completed, total })} aria-valuemin={0} aria-valuemax={100}
                  aria-valuenow={progress} className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
                  <div className="h-full rounded-full bg-primary dark:bg-success" style={{ width: `${progress}%` }} />
                </div>
              </Link>
              <WorkspaceGoalActions goal={goal} selected={selected}/>
            </div>
          );
        }} />
        <Link href={workspaceHref("unassigned", view === "documents" ? "board" : view)} prefetch={false} onClick={() => setExpanded(false)} aria-current={unassigned ? "page" : undefined}
          className={cn(linkClass, "border-t border-border text-muted-foreground", unassigned && "bg-muted text-foreground")}>
          {t("unassigned")}
        </Link>
      </nav>
    </aside>
  );
}
