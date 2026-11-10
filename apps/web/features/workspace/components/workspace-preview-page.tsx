import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { CreateTaskModal } from "@/features/tasks/components/create-task-modal";
import { TASK_BOARD_LANES } from "@/features/tasks/task-status";
import { Link } from "@/i18n/navigation";
import { getWorkspaceScopeKey } from "../workspace.utils";
import { getWorkspacePreview, workspaceDeadlines, workspacePriorities } from "../workspace-preview.queries";
import { searchWorkspaceGoals } from "../workspace-goal-search.action";
import { WorkspaceCreateGoalButton } from "./workspace-create-goal-button";
import { WorkspaceGoalPicker } from "./workspace-goal-picker";
import { WorkspacePreviewDetails } from "./workspace-preview-details";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export async function WorkspacePreviewPage({
  params,
  locale,
}: {
  params: Record<string, string | string[] | undefined>;
  locale: string;
}) {
  const [page, recentGoals, t, header, taskT, format] = await Promise.all([
    getWorkspacePreview(params),
    searchWorkspaceGoals(""),
    getTranslations("workspace.preview"),
    getTranslations("workspace.page"),
    getTranslations("tasks.form"),
    getFormatter(),
  ]);
  const scopeKey = getWorkspaceScopeKey(page.scope);
  const goals = page.goal && !recentGoals.some((goal) => goal.id === page.goal?.id)
    ? [page.goal, ...recentGoals.slice(0, 7)]
    : recentGoals;
  const query = new URLSearchParams({ goal: scopeKey });
  for (const key of ["q", "status", "priority", "deadline"] as const) {
    const value = page.filters[key];
    if (value) query.set(key, value);
  }
  const firstHref = `/workspace?${query}`;
  if (page.after) query.set("after", page.after);
  const currentHref = `/workspace?${query}`;
  const tab = params.tab;
  const selectedTab = tab === "overview" || tab === "subtasks" || tab === "documents" || tab === "review" ? tab : undefined;
  const selectClass = "w-full rounded-md border bg-background px-2 py-2 text-sm";

  return (
    <section className="min-w-0 space-y-section">
      <PageHeader
        eyebrow={header("eyebrow")}
        title={header("title")}
        description={t("description")}
        action={
          <div className="flex flex-wrap gap-2">
            <WorkspaceCreateGoalButton />
            <CreateTaskModal key={scopeKey} goals={goals} defaultGoalId={page.goal?.id} searchableGoals />
          </div>
        }
      />

      <form method="get" action={`/${locale}/workspace`} className="grid items-end gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3" key={firstHref}>
        <label className="grid gap-1 text-sm">
          {t("taskSearch")}
          <Input name="q" maxLength={120} defaultValue={page.filters.q} />
        </label>
        <div className="space-y-1 text-sm">
          <label htmlFor="workspace-goal">{t("goal")}</label>
          <WorkspaceGoalPicker
            id="workspace-goal"
            name="goal"
            value={scopeKey}
            goals={goals}
            emptyOptions={<><option value="all">{t("allGoals")}</option><option value="unassigned">{t("unassigned")}</option></>}
          />
        </div>
        <label className="grid gap-1 text-sm">
          {t("status")}
          <select name="status" defaultValue={page.filters.status ?? ""} className={selectClass}>
            <option value="">{t("any")}</option>
            {TASK_BOARD_LANES.map((status) => <option key={status} value={status}>{taskT(`statuses.${status}`)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          {t("priority")}
          <select name="priority" defaultValue={page.filters.priority ?? ""} className={selectClass}>
            <option value="">{t("any")}</option>
            {workspacePriorities.map((priority) => <option key={priority} value={priority}>{taskT(`priorities.${priority}`)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          {t("deadline")}
          <select name="deadline" defaultValue={page.filters.deadline ?? ""} className={selectClass}>
            <option value="">{t("any")}</option>
            {workspaceDeadlines.map((deadline) => <option key={deadline} value={deadline}>{t(`deadlines.${deadline}`)}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit">{t("apply")}</Button>
          <Button variant="ghost" asChild><Link href="/workspace">{t("reset")}</Link></Button>
        </div>
      </form>

      {page.missingTask && <p role="status">{t("taskUnavailable")}</p>}
      <section aria-label={t("tasks")} className="space-y-3">
        <h2 data-testid="workspace-preview-total" className="font-semibold">{t("total", { count: page.total })}</h2>
        {page.tasks.length ? (
          <ul className="divide-y rounded-lg border">
            {page.tasks.map((task) => (
              <li key={task.id} data-testid="workspace-preview-task" className="grid min-w-0 gap-1 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <Link href={`${currentHref}&task=${task.id}`} scroll={false} prefetch={false} className="break-words font-medium hover:underline">
                    {task.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">{task.goal_title ?? t("unassigned")}</p>
                </div>
                <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                  <span>{taskT(`statuses.${task.effective_status}`)}</span>
                  <span>{taskT(`priorities.${task.priority}`)}</span>
                  {task.due_at && <span>{format.dateTime(new Date(task.due_at), { dateStyle: "medium" })}</span>}
                  {task.subtask_count > 0 && <span>{t("checklist", { completed: task.completed_subtask_count, total: task.subtask_count })}</span>}
                </p>
              </li>
            ))}
          </ul>
        ) : <p>{t("empty")}</p>}
        <div className="flex flex-wrap gap-2">
          {page.after && <Button variant="outline" asChild><Link href={firstHref}>{t("first")}</Link></Button>}
          {page.next && <Button variant="outline" asChild><Link href={`${firstHref}&after=${page.next}`} prefetch={false}>{t("next")}</Link></Button>}
        </div>
      </section>

      {page.task && <WorkspacePreviewDetails task={page.task} goals={goals} closeHref={currentHref} tab={selectedTab} edit={params.edit === "1"} />}
    </section>
  );
}
