import { getTranslations } from "next-intl/server";
import { Target } from "lucide-react";

import { getGoalById, getGoalPage } from "@/features/goals/goal.queries";
import type { TaskDrawerTab } from "@/features/tasks/components/task-details-drawer";
import { WorkspaceBoard } from "@/features/workspace/components/workspace-board";
import { WorkspaceGoalActions } from "@/features/workspace/components/workspace-goal-actions";
import { WorkspaceGoalRail } from "@/features/workspace/components/workspace-goal-rail";
import { getWorkspaceLinkedTask, getWorkspaceTasks } from "@/features/workspace/workspace.queries";
import { getWorkspaceScopeKey, resolveWorkspaceScope } from "@/features/workspace/workspace.utils";
import { getWorkspaceTaskRiskStates } from "@/features/native-task-risk/task-risk-workspace.queries";
import { resolveTaskRiskSnapshot } from "@/features/native-task-risk/task-risk-snapshot.adapter";
import type { WorkspaceScope, WorkspaceTask } from "@/features/workspace/workspace.types";

type WorkspacePageProps = {
  searchParams: Promise<{
    goal?: string;
    task?: string;
    tab?: string;
    edit?: string;
  }>;
};

function resolveTaskTab(value: string | undefined): TaskDrawerTab | undefined {
  if (value === "overview" || value === "risk" || value === "subtasks" || value === "documents" || value === "review") {
    return value;
  }
}

async function WorkspaceBoardContent({ scope, linkedTask, tab, edit }: {
  scope: WorkspaceScope;
  linkedTask: WorkspaceTask | null;
  tab?: TaskDrawerTab;
  edit: boolean;
}) {
  const tasks = await getWorkspaceTasks(scope);
  const now = new Date();
  const riskTasks = linkedTask && !tasks.some((task) => task.id === linkedTask.id)
    ? [...tasks, linkedTask]
    : tasks;
  const riskStates = await getWorkspaceTaskRiskStates(riskTasks, { now }).catch(() =>
    Object.fromEntries(riskTasks.map((task) => [task.id, resolveTaskRiskSnapshot(task, undefined, now)])),
  );

  return (
    <WorkspaceBoard
      key={JSON.stringify([getWorkspaceScopeKey(scope), linkedTask?.id, tab, edit])}
      tasks={tasks}
      goalId={scope.type === "goal" ? scope.goalId : null}
      linkedTask={linkedTask}
      initialTaskTab={tab}
      initialEditMode={edit}
      referenceNow={now.toISOString()}
      riskStates={riskStates}
    />
  );
}

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const [t, railT, params, goalPage] = await Promise.all([
    getTranslations("workspace.page"),
    getTranslations("workspace.rail"),
    searchParams,
    getGoalPage({ includeProgress: true }),
  ]);

  const linkedTask = params.task ? await getWorkspaceLinkedTask(params.task) : null;
  const requestedGoal = linkedTask ? linkedTask.goal_id ?? "unassigned" : params.goal;
  const goal = requestedGoal && requestedGoal !== "all" && requestedGoal !== "unassigned"
    ? await getGoalById(requestedGoal)
    : null;
  const scope = resolveWorkspaceScope(requestedGoal, goal?.id);
  const goalOption = goal ? { id: goal.id, title: goal.title } : null;
  const missingGoal = !scope && requestedGoal && requestedGoal !== "all";
  const missingTask = Boolean(params.task && !linkedTask);

  return (
    <section className="min-w-0 space-y-section">
      <h1 className="text-page font-semibold text-foreground">{t("title")}</h1>

      <div className="grid min-w-0 items-start gap-card lg:grid-cols-[14rem_minmax(0,1fr)]">
        <WorkspaceGoalRail initialPage={goalPage} selectedGoal={goalOption} unassigned={scope?.type === "unassigned"} />

        <section className="min-w-0 space-y-card" aria-label={t("content")}>
          {missingTask && <p role="status" className="text-body text-muted-foreground">{t("taskUnavailable")}</p>}
          {scope ? (
            <>
              <header className="flex min-w-0 items-center justify-between gap-3 border-b border-border pb-2">
                <h2 className="min-w-0 text-section font-semibold wrap-anywhere">{goal?.title ?? railT("unassigned")}</h2>
                {goal && <WorkspaceGoalActions goal={goal} />}
              </header>
              <WorkspaceBoardContent scope={scope} linkedTask={linkedTask} tab={resolveTaskTab(params.tab)} edit={params.edit === "1"} />
            </>
          ) : (
            <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-border p-card text-center">
              <div className="max-w-sm space-y-2">
                <Target aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
                <h2 className="text-section font-semibold">{t(missingGoal ? "goalUnavailable" : "chooseGoal")}</h2>
                <p className="text-body text-muted-foreground">{t("chooseGoalDescription")}</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
