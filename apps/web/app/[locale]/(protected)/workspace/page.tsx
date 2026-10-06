import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/features/app-shell/components/page-header";

import { WorkspaceCreateGoalButton } from "@/features/workspace/components/workspace-create-goal-button";

import { getGoalsWithProgress } from "@/features/goals/goal.queries";

import { CreateTaskModal } from "@/features/tasks/components/create-task-modal";

import { WorkspaceBoard } from "@/features/workspace/components/workspace-board";

import { WorkspaceGoalRail } from "@/features/workspace/components/workspace-goal-rail";

import { getWorkspaceTasks } from "@/features/workspace/workspace.queries";

import {
  getWorkspaceScopeKey,
  resolveWorkspaceScope,
} from "@/features/workspace/workspace.utils";

import type { TaskDrawerTab } from "@/features/tasks/components/task-details-drawer";

type WorkspacePageProps = {
  searchParams: Promise<{
    goal?: string;

    task?: string;

    tab?: string;

    edit?: string;
  }>;
};

function resolveTaskTab(value: string | undefined): TaskDrawerTab {
  if (
    value === "overview" ||
    value === "subtasks" ||
    value === "documents" ||
    value === "review"
  ) {
    return value;
  }

  return "overview";
}

export default async function WorkspacePage({
  searchParams,
}: WorkspacePageProps) {
  const [t, params, goals] = await Promise.all([
    getTranslations("workspace.page"),

    searchParams,

    getGoalsWithProgress(),
  ]);

  const scope = resolveWorkspaceScope(
    params.goal,

    goals.map((goal) => goal.id),
  );

  const tasks = await getWorkspaceTasks(scope);

  const selectedKey = getWorkspaceScopeKey(scope);

  const defaultGoalId = scope.type === "goal" ? scope.goalId : undefined;

  const initialTaskId =
    params.task && tasks.some((task) => task.id === params.task)
      ? params.task
      : null;

  const initialTaskTab = resolveTaskTab(params.tab);

  const initialEditMode = params.edit === "1";

  const referenceNow = new Date().toISOString();

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <WorkspaceCreateGoalButton />

            <CreateTaskModal
              key={defaultGoalId ?? selectedKey}
              goals={goals}
              defaultGoalId={defaultGoalId}
            />
          </div>
        }
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <WorkspaceGoalRail goals={goals} selectedKey={selectedKey} />

        <WorkspaceBoard
          key={selectedKey}
          tasks={tasks}
          goals={goals}
          scope={scope}
          referenceNow={referenceNow}
          initialTaskId={initialTaskId}
          initialTaskTab={initialTaskTab}
          initialEditMode={initialEditMode}
        />
      </div>
    </section>
  );
}
