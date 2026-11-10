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
import { WorkspaceGoalsDirectory } from "./workspace-goals-directory";
import { WorkspaceGoalDocuments } from "./workspace-goal-documents";
import { WorkspaceQuickCreateTask } from "./workspace-quick-create-task";
import { WorkspaceTaskQuickEdit } from "./workspace-task-quick-edit";
import { cn } from "@/lib/utils";

export async function WorkspacePreviewPage({
  params,
  locale,
}: {
  params: Record<string, string | string[] | undefined>;
  locale: string;
}) {
  const [page, recentGoals, t, mvp, header, taskT, format] = await Promise.all([
    getWorkspacePreview(params),
    searchWorkspaceGoals(""),
    getTranslations("workspace.preview"),
    getTranslations("workspace.mvp"),
    getTranslations("workspace.page"),
    getTranslations("tasks.form"),
    getFormatter(),
  ]);
  const scopeKey = getWorkspaceScopeKey(page.scope);
  const goals = page.goal && !recentGoals.some((goal) => goal.id === page.goal?.id)
    ? [page.goal, ...recentGoals.slice(0, 7)]
    : recentGoals;
  const directory = params.view === "goals";
  const query = new URLSearchParams(page.focus ? { view: "focus" } : { goal: scopeKey });
  for (const key of ["q", "status", "priority", "deadline"] as const) {
    const value = page.filters[key];
    if (value) query.set(key, value);
  }
  const firstHref = `/workspace?${query}`;
  if (page.after) query.set("after", page.after);
  const workHref = `/workspace?${query}`;
  if (page.documents) query.set("section", "documents");
  const currentHref = `/workspace?${query}`;
  const documentsHref = `${workHref}&section=documents`;
  const navigation = [
    { href: "/workspace", label: mvp("focus"), active: page.focus },
    { href: "/workspace?goal=all", label: mvp("allTasks"), active: !directory && !page.focus && !page.goal },
    { href: "/workspace?view=goals", label: mvp("goals"), active: directory },
  ];
  const tab = params.tab;
  const selectedTab = tab === "overview" || tab === "subtasks" || tab === "documents" || tab === "review" ? tab : undefined;
  const selectClass = "w-full rounded-md border bg-background px-2 py-2 text-sm";

  return (
    <section className="min-w-0 space-y-section">
      <PageHeader
        eyebrow={header("eyebrow")}
        title={header("title")}
        description={page.focus ? mvp("focusDescription") : header("description")}
        action={
          <div className="flex flex-wrap gap-2">
            <WorkspaceCreateGoalButton />
            <CreateTaskModal key={scopeKey} goals={goals} defaultGoalId={page.goal?.id} searchableGoals />
          </div>
        }
      />

      <div className="grid min-w-0 gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <nav aria-label={mvp("navigation")} className="flex flex-wrap gap-1 lg:grid">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} prefetch={false} aria-current={item.active ? "page" : undefined}
                className={cn("rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted", item.active && "bg-muted text-foreground")}>
                {item.label}
              </Link>
            ))}
          </nav>
          {recentGoals.length > 0 && (
            <nav aria-label={mvp("recentGoals")} className="hidden space-y-1 lg:block">
              <p className="px-3 text-xs font-medium text-muted-foreground">{mvp("recentGoals")}</p>
              {recentGoals.map((goal) => (
                <Link key={goal.id} href={`/workspace?goal=${goal.id}`} prefetch={false}
                  aria-current={goal.id === page.goal?.id ? "page" : undefined}
                  className="block break-words rounded-lg px-3 py-2 text-sm hover:bg-muted">
                  {goal.title}
                </Link>
              ))}
            </nav>
          )}
        </aside>
        <div className="min-w-0 space-y-4">
          {directory ? <WorkspaceGoalsDirectory params={params} locale={locale} /> : <>
            {page.goal && (
              <section className="space-y-3 rounded-xl border bg-card p-4">
                <h2 className="break-words text-xl font-semibold">{page.goal.title}</h2>
                <p className="text-sm text-muted-foreground">{mvp("progress", page.progress)}</p>
                <progress className="block h-2 w-full max-w-56 accent-primary" aria-label={mvp("progress", page.progress)} value={Math.min(page.progress.completed, page.progress.total)} max={page.progress.total || 1} />
                <nav aria-label={mvp("goalSections")} className="flex flex-wrap gap-2">
                  <Button variant={page.documents ? "ghost" : "secondary"} size="sm" asChild>
                    <Link href={workHref} prefetch={false} aria-current={!page.documents ? "page" : undefined}>{mvp("work")}</Link>
                  </Button>
                  <Button variant={page.documents ? "secondary" : "ghost"} size="sm" asChild>
                    <Link href={documentsHref} prefetch={false} aria-current={page.documents ? "page" : undefined}>{mvp("documents")}</Link>
                  </Button>
                </nav>
              </section>
            )}
            {page.documents && page.goal ? <WorkspaceGoalDocuments goalId={page.goal.id} /> : <>
            {page.focus ? (
              <section className="space-y-3 rounded-xl border bg-card p-4">
                <h2 className="text-xl font-semibold">{mvp("focus")}</h2>
                <form method="get" action={`/${locale}/workspace`} className="flex flex-wrap gap-2">
                  <input type="hidden" name="goal" value="all" />
                  <Input name="q" className="min-w-0 flex-1 basis-48" maxLength={120} aria-label={t("taskSearch")} placeholder={t("taskSearch")} />
                  <Button type="submit" variant="outline">{mvp("searchAll")}</Button>
                </form>
                {page.reviewCount > 0 && (
                  <Link href="/workspace?goal=all&status=in_review" className="inline-block text-sm font-medium text-primary hover:underline" prefetch={false}>
                    {mvp("reviewWaiting", { count: page.reviewCount })}
                  </Link>
                )}
              </section>
            ) : (
                <form method="get" action={`/${locale}/workspace`} className="grid items-end gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3" key={firstHref}>
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
                    <Button variant="ghost" asChild><Link href={`/workspace?goal=${scopeKey}`}>{t("reset")}</Link></Button>
                  </div>
                </form>
            )}

              {page.missingTask && <p role="status">{t("taskUnavailable")}</p>}
              <section aria-label={t("tasks")} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 data-testid="workspace-preview-total" className="font-semibold">{page.focus ? mvp("focusTotal", { count: page.total }) : t("total", { count: page.total })}</h2>
                  {page.focus && <Link href="/workspace?goal=all" prefetch={false} className="text-sm font-medium text-primary hover:underline">{mvp("viewAllTasks")}</Link>}
                </div>
                <WorkspaceQuickCreateTask key={scopeKey} goalId={page.goal?.id ?? null} withOptions />
                {page.tasks.length ? (
                  <ul className="divide-y rounded-xl border bg-card">
                    {page.tasks.map((task) => (
                      <li key={task.id} data-testid="workspace-preview-task" className="grid min-w-0 gap-2 p-3 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,auto)] xl:items-start">
                        <div className="min-w-0">
                          <Link href={`${currentHref}&task=${task.id}`} scroll={false} prefetch={false} className="break-words font-medium hover:underline">
                            {task.title}
                          </Link>
                          <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
                            <span>{task.goal_title ?? t("unassigned")}</span>
                            {task.effective_status === "overdue" && <span className="font-medium text-destructive">{taskT("statuses.overdue")}</span>}
                            {task.subtask_count > 0 && <span>{t("checklist", { completed: task.completed_subtask_count, total: task.subtask_count })}</span>}
                          </p>
                        </div>
                        <WorkspaceTaskQuickEdit task={{
                          id: task.id, title: task.title, status: task.status, effective_status: task.effective_status,
                          priority: task.priority, due_at: task.due_at, updated_at: task.updated_at,
                        }} deadlineLabel={task.due_at ? format.dateTime(new Date(task.due_at), { dateStyle: "medium" }) : mvp("setDeadline")} />
                      </li>
                    ))}
                  </ul>
                ) : <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">{page.focus ? mvp("focusEmpty") : t("empty")}</p>}
                <div className="flex flex-wrap gap-2">
                  {page.after && <Button variant="outline" asChild><Link href={firstHref}>{t("first")}</Link></Button>}
                  {page.next && <Button variant="outline" asChild><Link href={`${firstHref}&after=${page.next}`} prefetch={false}>{t("next")}</Link></Button>}
                </div>
              </section>
            </>}
          </>}
        </div>
      </div>

      {page.task && <WorkspacePreviewDetails task={page.task} goals={goals} closeHref={currentHref} tab={selectedTab} edit={params.edit === "1"} />}
    </section>
  );
}
