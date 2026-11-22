import { getTranslations } from "next-intl/server";
import { CalendarRange, Target } from "lucide-react";

import { getGoalById, getGoalPage } from "@/features/goals/goal.queries";
import type { TaskDrawerTab } from "@/features/tasks/components/task-details-drawer";
import type { TaskWithGoal } from "@/features/tasks/task.types";
import { WorkspaceBoard } from "@/features/workspace/components/workspace-board";
import { WorkspaceGoalActions } from "@/features/workspace/components/workspace-goal-actions";
import { WorkspaceGoalRail } from "@/features/workspace/components/workspace-goal-rail";
import { WorkspaceTaskDetails } from "@/features/workspace/components/workspace-task-details";
import { WorkspaceTaskList } from "@/features/workspace/components/workspace-task-list";
import { WorkspaceViewTabs } from "@/features/workspace/components/workspace-view-tabs";
import { getWorkspaceBoard, getWorkspaceLinkedTask, getWorkspaceListPage } from "@/features/workspace/workspace.queries";
import { getWorkspaceScopeKey, resolveWorkspaceBoardPages, resolveWorkspaceListOptions, resolveWorkspaceScope, resolveWorkspaceView, workspaceBoardHref, workspaceHref } from "@/features/workspace/workspace.utils";
import { getWorkspaceTaskRiskStates } from "@/features/native-task-risk/task-risk-workspace.queries";
import { resolveTaskRiskSnapshot } from "@/features/native-task-risk/task-risk-snapshot.adapter";
import type { WorkspaceBoardPages, WorkspaceListOptions, WorkspaceScope, WorkspaceView } from "@/features/workspace/workspace.types";

type WorkspacePageProps = {
  searchParams: Promise<{
    goal?: string;
    view?: string;
    lanes?: string;
    status?: string;
    sort?: string;
    page?: string;
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

async function WorkspaceTimelinePlaceholder() {
  const t = await getTranslations("workspace.views");
  return (
    <div className="grid min-h-52 place-items-center rounded-lg border border-dashed border-border p-card text-center">
      <div className="max-w-sm space-y-2">
        <CalendarRange aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
        <h3 className="text-section font-semibold">{t("timeline")}</h3>
        <p className="text-body text-muted-foreground">{t("timelinePlaceholder")}</p>
      </div>
    </div>
  );
}

async function WorkspaceViewContent({ scope, view, list, boardPages, linkedTask, tab, edit }: {
  scope: WorkspaceScope;
  view: WorkspaceView;
  list: WorkspaceListOptions;
  boardPages: WorkspaceBoardPages;
  linkedTask: TaskWithGoal | null;
  tab?: TaskDrawerTab;
  edit: boolean;
}) {
  const goal = getWorkspaceScopeKey(scope);
  const now = new Date();
  const referenceNow = now.toISOString();
  const board = view === "board" ? await getWorkspaceBoard(scope, boardPages, referenceNow) : undefined;
  const listPage = view === "list" ? await getWorkspaceListPage(scope, list, referenceNow) : undefined;
  const tasks = board?.tasks ?? listPage?.tasks ?? [];
  const riskTasks = linkedTask && !tasks.some((task) => task.id === linkedTask.id)
    ? [...tasks, linkedTask]
    : tasks;
  const riskStates = await getWorkspaceTaskRiskStates(riskTasks, { now }).catch(() =>
    Object.fromEntries(riskTasks.map((task) => [task.id, resolveTaskRiskSnapshot(task, undefined, now)])),
  );
  const listOptions = { ...list, page: listPage?.page ?? list.page };

  return (
    <WorkspaceTaskDetails
      key={`${goal}:${view}`}
      linkedTask={linkedTask}
      boardTasks={board?.tasks}
      tab={tab}
      edit={edit}
      closeHref={view === "board" ? workspaceBoardHref(goal, boardPages) : workspaceHref(goal, view, listOptions)}
      referenceNow={referenceNow}
      riskStates={riskStates}
    >
      {board && (
        <WorkspaceBoard
          tasks={board.tasks}
          goalId={scope.type === "goal" ? scope.goalId : null}
          referenceNow={referenceNow}
          pagination={board.pagination}
        />
      )}
      {listPage && (
        <WorkspaceTaskList
          goal={goal}
          options={listOptions}
          tasks={listPage.tasks}
          totalPages={listPage.totalPages}
          referenceNow={referenceNow}
        />
      )}
      {view === "timeline" && <WorkspaceTimelinePlaceholder />}
    </WorkspaceTaskDetails>
  );
}

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const [t, railT, params, goalPage] = await Promise.all([
    getTranslations("workspace.page"),
    getTranslations("workspace.rail"),
    searchParams,
    getGoalPage({ includeProgress: true }),
  ]);

  const view = resolveWorkspaceView(params.view);
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
        <WorkspaceGoalRail initialPage={goalPage} selectedGoal={goalOption} unassigned={scope?.type === "unassigned"} view={view} />

        <section className="min-w-0 space-y-card" aria-label={t("content")}>
          {missingTask && <p role="status" className="text-body text-muted-foreground">{t("taskUnavailable")}</p>}
          {scope ? (
            <>
              <header className="flex min-w-0 items-center justify-between gap-3 border-b border-border pb-2">
                <h2 className="min-w-0 text-section font-semibold wrap-anywhere">{goal?.title ?? railT("unassigned")}</h2>
                {goal && <WorkspaceGoalActions goal={goal} />}
              </header>
              <WorkspaceViewTabs goal={getWorkspaceScopeKey(scope)} view={view} />
              <WorkspaceViewContent
                scope={scope}
                view={view}
                list={resolveWorkspaceListOptions(params)}
                boardPages={resolveWorkspaceBoardPages(params.lanes)}
                linkedTask={linkedTask}
                tab={resolveTaskTab(params.tab)}
                edit={params.edit === "1"}
              />
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
