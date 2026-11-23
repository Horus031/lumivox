"use client";

import { useId, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { getStatusTone } from "@/lib/utils/color";
import type { WorkspaceTimelineLabels, WorkspaceTimelinePeriod, WorkspaceTimelineRow } from "../workspace-timeline";
import { workspaceTimelineHref } from "../workspace.utils";
import { useWorkspaceTaskDetails } from "./workspace-task-details";

type TimelinePage = { rows: WorkspaceTimelineRow[]; page: number; totalPages: number };

const rowLayout = "grid min-w-[50.25rem] grid-cols-[8.25rem_1fr] sm:min-w-[55rem] sm:grid-cols-[13rem_1fr]";
const trackLayout = "relative grid grid-cols-[repeat(28,minmax(0,1fr))]";
const pinnedTask = "sticky left-0 z-10 flex min-w-0 flex-col items-start justify-center gap-1 border-r border-border px-2 py-2 sm:px-3";

export function WorkspaceTaskTimeline({ goal, period, labels, dated, undated }: {
  goal: string;
  period: WorkspaceTimelinePeriod;
  labels: WorkspaceTimelineLabels;
  dated: TimelinePage;
  undated: TimelinePage;
}) {
  const t = useTranslations("workspace.timeline");
  const taskT = useTranslations("tasks.form");
  const router = useRouter();
  const dateInputId = useId();
  const { onTaskLinkClick } = useWorkspaceTaskDetails();
  const todayIndex = period.days.indexOf(period.today);
  const periodHref = (start: string) => workspaceTimelineHref(goal, start, 1, undated.page);
  const taskHref = (id: string) => workspaceTimelineHref(goal, period.start, dated.page, undated.page, id);
  const commonParams = { goal, view: "timeline", start: period.start };
  const gridLines = {
    backgroundImage: "linear-gradient(to right, var(--color-border) 1px, transparent 1px)",
    backgroundSize: "calc(100% / 28) 100%",
  };

  function rememberTrigger(event: MouseEvent<HTMLAnchorElement>, taskId: string) {
    if (!event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      onTaskLinkClick(taskId, event.currentTarget);
    }
  }

  return (
    <div className="min-w-0 space-y-section">
      <section aria-label={t("title")} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="icon" variant="outline" asChild={Boolean(period.previous)} disabled={!period.previous} aria-label={t("previous")}>
              {period.previous ? <Link href={periodHref(period.previous)} prefetch={false} scroll={false}><ChevronLeft aria-hidden="true" /></Link> : <ChevronLeft aria-hidden="true" />}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href={periodHref(period.current)} prefetch={false} scroll={false}>{t("today")}</Link>
            </Button>
            <Button size="icon" variant="outline" asChild={Boolean(period.next)} disabled={!period.next} aria-label={t("next")}>
              {period.next ? <Link href={periodHref(period.next)} prefetch={false} scroll={false}><ChevronRight aria-hidden="true" /></Link> : <ChevronRight aria-hidden="true" />}
            </Button>
            <h3 aria-live="polite" className="text-label font-semibold tabular-nums">{labels.range}</h3>
          </div>
          <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => {
            event.preventDefault();
            const date = new FormData(event.currentTarget).get("date");
            if (typeof date === "string" && date) router.push(periodHref(date), { scroll: false });
          }}>
            <label htmlFor={dateInputId} className="sr-only">{t("jumpDate")}</label>
            <Input key={period.start} id={dateInputId} name="date" type="date" defaultValue={period.start} required className="w-auto" />
            <Button type="submit" size="sm" variant="outline">{t("jumpDate")}</Button>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
          <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-2 w-5 rounded-full bg-primary" />{t("studyPlan")}</span>
          <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2 rotate-45 rounded-[1px] bg-warning" />{t("deadline")}</span>
          <span>{t("timezone", { timezone: period.timezone })}</span>
        </div>

        <div role="region" aria-label={t("chart")} tabIndex={0} className="min-w-0 overflow-x-auto rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className={cn(rowLayout, "bg-muted text-muted-foreground")}>
            <span className={cn(pinnedTask, "bg-muted text-caption font-medium")}>{t("task")}</span>
            <div className={cn(trackLayout, "text-center text-caption tabular-nums")} aria-hidden="true" style={gridLines}>
              {labels.weeks.map((label) => (
                <span key={label} className="col-span-7 border-r border-border py-1.5 font-medium">
                  {label}
                </span>
              ))}
              {period.days.map((day, index) => (
                <span key={day} className={cn("border-t border-border py-1", index === todayIndex && "bg-primary/15 font-semibold text-foreground")}>{Number(day.slice(-2))}</span>
              ))}
            </div>
          </div>
          {dated.rows.length ? (
            <ul>
              {dated.rows.map((task) => {
                const { schedule, due } = task;
                const scheduleLabel = schedule && t("plannedDates", { start: labels.dates[schedule.start], end: labels.dates[schedule.end] });
                const scheduleState = schedule?.status === "paused" ? t("paused") : schedule?.status === "closed" ? t("closed") : null;
                const dueLabel = due && t("deadlineDate", { date: labels.dates[due.date] });
                return (
                  <li key={task.id}>
                    <Link href={taskHref(task.id)} prefetch={false} scroll={false} onClick={(event) => rememberTrigger(event, task.id)}
                      className={cn(rowLayout, "group border-t border-border bg-card hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")}>
                      <span className={cn(pinnedTask, "bg-card group-hover:bg-muted group-focus-visible:bg-muted")}>
                        <span className="line-clamp-2 wrap-anywhere text-label font-medium" title={task.title}>{task.title}</span>
                        <Badge variant="outline" className={getStatusTone(task.status)}>{taskT(`statuses.${task.status}`)}</Badge>
                        <span className="sr-only">{[scheduleLabel, scheduleState, dueLabel].filter(Boolean).join(". ")}</span>
                      </span>
                      <span className={cn(trackLayout, "min-h-14 items-center")} aria-hidden="true" style={gridLines}>
                        {todayIndex >= 0 && <span className="col-span-1 row-start-1 h-full bg-primary/10" style={{ gridColumnStart: todayIndex + 1 }} />}
                        {schedule && <span title={[scheduleLabel, scheduleState].filter(Boolean).join(". ")}
                          className={cn("z-1 row-start-1 mx-0.5 h-3 rounded-full bg-primary/75", scheduleState && "bg-muted-foreground/50")}
                          style={{ gridColumn: `${schedule.from + 1} / ${schedule.to + 2}` }} />}
                        {due && <span title={dueLabel || undefined} className="z-2 row-start-1 size-2.5 rotate-45 justify-self-center rounded-[1px] bg-warning ring-1 ring-background" style={{ gridColumnStart: due.offset + 1 }} />}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <p className="border-t border-border p-5 text-body text-muted-foreground">{t("emptyPeriod")}</p>}
        </div>
        {dated.totalPages > 1 && <DataTablePagination basePath="/workspace" page={dated.page} totalPages={dated.totalPages}
          searchParams={{ ...commonParams, undatedPage: undated.page > 1 ? undated.page : undefined }} prefetch={false} />}
      </section>

      {undated.rows.length > 0 && (
        <section aria-label={t("undated")} className="space-y-2">
          <h3 className="text-section font-semibold">{t("undated")}</h3>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {undated.rows.map((task) => (
              <li key={task.id}>
                <Link href={taskHref(task.id)} prefetch={false} scroll={false} onClick={(event) => rememberTrigger(event, task.id)}
                  className="flex min-h-touch items-center justify-between gap-3 px-3 py-2 text-label hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <span className="min-w-0 wrap-anywhere font-medium">{task.title}</span>
                  <Badge variant="outline" className={cn("shrink-0", getStatusTone(task.status))}>{taskT(`statuses.${task.status}`)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
          {undated.totalPages > 1 && <DataTablePagination basePath="/workspace" page={undated.page} pageParam="undatedPage" totalPages={undated.totalPages}
            searchParams={{ ...commonParams, page: dated.page > 1 ? dated.page : undefined }} prefetch={false} />}
        </section>
      )}
    </div>
  );
}
