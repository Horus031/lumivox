import { getFormatter, getTranslations } from "next-intl/server";
import { Columns3, FileText, List, SlidersHorizontal, Target } from "lucide-react";
import { CreateTaskModal } from "@/features/tasks/components/create-task-modal";
import { TASK_BOARD_LANES } from "@/features/tasks/task-status";
import { Link } from "@/i18n/navigation";
import { getWorkspaceScopeKey } from "../workspace.utils";
import { getWorkspacePreview } from "../workspace-preview.queries";
import { workspaceDeadlines, workspacePriorities } from "../workspace-board-pages";
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
import { WorkspaceBoardLoader } from "./workspace-board-loader";

export async function WorkspacePreviewPage({
  params,
  locale,
}: {
  params: Record<string, string | string[] | undefined>;
  locale: string;
}) {
  const [page, recentGoals, t, mvp, header, taskT, format, layoutT, ui] = await Promise.all([
    getWorkspacePreview(params),
    searchWorkspaceGoals(""),
    getTranslations("workspace.preview"),
    getTranslations("workspace.mvp"),
    getTranslations("workspace.page"),
    getTranslations("tasks.form"),
    getFormatter(),
    getTranslations("workspace.phase3"),
    getTranslations("workspace.compact"),
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
  const listHref = `/workspace?${query}`;
  const boardHref = `${listHref}&layout=board`;
  if (page.board) query.set("layout", "board");
  const firstHref = `/workspace?${query}`;
  if (page.after) query.set("after", page.after);
  if (page.documents) query.set("section", "documents");
  const currentHref = `/workspace?${query}`;
  const documentsHref = `${page.board ? boardHref : listHref}&section=documents`;
  const navigation = [
    { href: "/workspace", label: mvp("focus"), active: page.focus },
    { href: "/workspace?goal=all", label: mvp("allTasks"), active: !directory && !page.focus && !page.goal },
    { href: "/workspace?view=goals", label: mvp("goals"), active: directory },
  ];
  const tab = params.tab;
  const selectedTab = tab === "overview" || tab === "subtasks" || tab === "documents" || tab === "review" ? tab : undefined;
  const selectClass = "min-h-8 w-full rounded-md border bg-background px-2 text-sm";
  const taskColumns = "grid grid-cols-[repeat(3,minmax(0,1fr))] items-center gap-x-2 gap-y-1 px-3 py-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(6.5rem,0.24fr)_minmax(5.5rem,0.2fr)_minmax(6rem,0.22fr)]";
  const tabs = [
    { label: layoutT("list"), href: listHref, icon: List, active: !page.board && !page.documents },
    { label: layoutT("board"), href: boardHref, icon: Columns3, active: page.board && !page.documents },
    ...(page.goal ? [{ label: mvp("documents"), href: documentsHref, icon: FileText, active: page.documents }] : []),
  ];

  return (
    <section className="grid min-w-0 gap-3 text-sm lg:min-h-[calc(100dvh-7rem)] lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-0">
        <aside className="min-w-0 space-y-3 border-b pb-2 lg:border-r lg:border-b-0 lg:pr-3">
          <nav aria-label={mvp("navigation")} className="flex flex-wrap gap-1 lg:grid">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} prefetch={false} aria-current={item.active ? "page" : undefined}
                className={cn("rounded-md px-2.5 py-1.5 font-medium hover:bg-muted", item.active && "bg-primary/10 text-primary")}>
                {item.label}
              </Link>
            ))}
          </nav>
            <nav aria-label={mvp("recentGoals")} className="hidden space-y-0.5 border-t pt-2 lg:block">
              <div className="flex items-center justify-between gap-2 pl-2.5">
                <span className="text-xs font-semibold text-muted-foreground">{mvp("recentGoals")}</span>
                <WorkspaceCreateGoalButton iconOnly />
              </div>
              {goals.map((goal) => (
                <Link key={goal.id} href={`/workspace?goal=${goal.id}`} prefetch={false}
                  aria-current={goal.id === page.goal?.id ? "page" : undefined}
                  className={cn("flex min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-muted",
                    goal.id === page.goal?.id && "bg-primary/10 font-medium text-primary")}>
                  <Target className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate" title={goal.title}>{goal.title}</span>
                </Link>
              ))}
            </nav>
        </aside>
        <div className="min-w-0 space-y-3 lg:pl-5">
          <header className="flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{header("title")}</p>
              <h1 className="mt-0.5 break-words text-xl font-semibold tracking-tight">
                {page.goal?.title ?? (directory ? mvp("goals") : page.focus ? mvp("focus") : mvp("allTasks"))}
              </h1>
              {page.goal && <p className="mt-0.5 text-xs text-muted-foreground">{mvp("progress", page.progress)}</p>}
            </div>
            <div className="flex items-center gap-2">
              <div className="lg:hidden"><WorkspaceCreateGoalButton iconOnly /></div>
              <CreateTaskModal key={scopeKey} goals={goals} defaultGoalId={page.goal?.id} searchableGoals />
            </div>
          </header>
          {!directory && !page.focus && (
            <nav aria-label={layoutT("layout")} className="flex flex-wrap gap-x-3 border-b">
              {tabs.map(({ label, href, icon: Icon, active }) => (
                <Link key={href} href={href} prefetch={false} aria-current={active ? "page" : undefined}
                  className={cn("-mb-px flex min-h-9 items-center gap-1.5 border-b-2 border-transparent px-1 font-medium hover:text-foreground",
                    active ? "border-primary text-primary" : "text-muted-foreground")}>
                  <Icon className="size-4" aria-hidden="true" />{label}
                </Link>
              ))}
            </nav>
          )}
          {directory ? <WorkspaceGoalsDirectory params={params} locale={locale} /> : <>
            {page.documents && page.goal ? <WorkspaceGoalDocuments goalId={page.goal.id} /> : <>
            {page.focus ? (
              <section className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y py-2">
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
                <form method="get" action={`/${locale}/workspace`} className="relative flex flex-wrap items-center gap-2" key={`filters:${firstHref}`}>
                  {page.board && <input type="hidden" name="layout" value="board" />}
                  <Input name="q" aria-label={t("taskSearch")} placeholder={t("taskSearch")} maxLength={120}
                    defaultValue={page.filters.q} className="w-full sm:w-52" />
                  <details className="group">
                    <summary className="flex h-touch cursor-pointer list-none items-center gap-1.5 rounded-md border px-2.5 text-label font-medium hover:bg-muted sm:h-control">
                      <SlidersHorizontal className="size-4" aria-hidden="true" />{ui("filters")}
                      {(scopeKey !== "all" || page.filters.status || page.filters.priority || page.filters.deadline) &&
                        <span className="size-1.5 rounded-full bg-primary" aria-label={ui("filtersActive")} />}
                    </summary>
                    <div className="absolute inset-x-0 top-full z-10 mt-1 grid gap-2 rounded-md border bg-popover p-3 shadow-md sm:right-auto sm:w-[24rem] sm:grid-cols-2">
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
                    </div>
                  </details>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="sm" variant="outline">{t("apply")}</Button>
                    {(page.filters.q || page.filters.status || page.filters.priority || page.filters.deadline) && (
                      <Button variant="ghost" size="sm" asChild><Link href={`/workspace?goal=${scopeKey}${page.board ? "&layout=board" : ""}`}>{t("reset")}</Link></Button>
                    )}
                  </div>
                </form>
            )}

              {page.missingTask && <p role="status">{t("taskUnavailable")}</p>}
              {page.lanes ? (
                <WorkspaceBoardLoader key={`board:${firstHref}`} initial={page.lanes} filters={page.boardFilters}
                  referenceNow={page.referenceNow} goalId={page.goal?.id ?? null} href={currentHref} />
              ) : <section aria-label={t("tasks")} className="rounded-md border">
                  <div role="table" aria-label={t("tasks")}>
                    <div role="row" className={cn(taskColumns, "border-b bg-muted/50 text-xs font-semibold text-muted-foreground max-sm:sr-only")}>
                      <div role="columnheader">{ui("task")}</div>
                      <div role="columnheader">{t("status")}</div>
                      <div role="columnheader">{t("priority")}</div>
                      <div role="columnheader">{t("deadline")}</div>
                    </div>
                    <div role="rowgroup" className="divide-y">
                    {page.tasks.map((task) => (
                      <div role="row" key={task.id} data-testid="workspace-preview-task" className={cn(taskColumns, "relative min-h-10 hover:bg-muted/30 focus-within:bg-muted/30")}>
                        <div role="cell" className="col-span-full min-w-0 sm:col-span-1">
                          <Link href={`${currentHref}&task=${task.id}`} scroll={false} prefetch={false} className="break-words font-medium hover:underline">
                            {task.title}
                          </Link>
                          <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                            {!page.goal && <span>{task.goal_title ?? t("unassigned")}</span>}
                            {task.effective_status === "overdue" && <span className="font-medium text-destructive">{taskT("statuses.overdue")}</span>}
                            {task.subtask_count > 0 && <span>{t("checklist", { completed: task.completed_subtask_count, total: task.subtask_count })}</span>}
                          </p>
                        </div>
                        <WorkspaceTaskQuickEdit task={{
                          id: task.id, title: task.title, status: task.status, effective_status: task.effective_status,
                          priority: task.priority, due_at: task.due_at, updated_at: task.updated_at,
                        }} deadlineLabel={task.due_at ? format.dateTime(new Date(task.due_at), { dateStyle: "medium" }) : mvp("setDeadline")} />
                      </div>
                    ))}
                    </div>
                  </div>
                  {!page.tasks.length && <p className="px-4 py-10 text-center text-sm text-muted-foreground">{page.focus ? mvp("focusEmpty") : t("empty")}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t px-2 py-1">
                  <WorkspaceQuickCreateTask key={scopeKey} goalId={page.goal?.id ?? null} withOptions compact />
                  <div className="flex flex-wrap items-center gap-2">
                    <span data-testid="workspace-preview-total" className="text-xs text-muted-foreground">{page.focus ? mvp("focusTotal", { count: page.total }) : t("total", { count: page.total })}</span>
                    {page.focus && <Link href="/workspace?goal=all" prefetch={false} className="px-1 text-xs font-medium text-primary hover:underline">{mvp("viewAllTasks")}</Link>}
                    {page.after && <Button size="sm" variant="ghost" asChild><Link href={firstHref}>{t("first")}</Link></Button>}
                    {page.next && <Button size="sm" variant="ghost" asChild><Link href={`${firstHref}&after=${page.next}`} prefetch={false}>{t("next")}</Link></Button>}
                  </div>
                </div>
              </section>}
            </>}
          </>}
        </div>

      {page.task && <WorkspacePreviewDetails key={page.task.id} task={page.task} goals={goals} closeHref={currentHref}
        tab={selectedTab} edit={params.edit === "1"} referenceNow={page.referenceNow} />}
    </section>
  );
}
