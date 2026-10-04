import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { CreateGoalForm } from "@/features/goals/components/create-goal.form";
import { getGoalsWithProgress } from "@/features/goals/goal.queries";
import { CreateTaskModal } from "@/features/tasks/components/create-task-modal";
import { WorkspaceBoard } from "@/features/workspace/components/workspace-board";
import { WorkspaceGoalRail } from "@/features/workspace/components/workspace-goal-rail";
import { getWorkspaceTasks } from "@/features/workspace/workspace.queries";
import {
  getWorkspaceScopeKey,
  resolveWorkspaceScope,
} from "@/features/workspace/workspace.utils";

type WorkspacePageProps = {
  searchParams: Promise<{
    goal?: string;
  }>;
};

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

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <CreateGoalForm
              trigger={
                <Button type="button" variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t("newGoal")}
                </Button>
              }
            />

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

        <WorkspaceBoard tasks={tasks} />
      </div>
    </section>
  );
}
