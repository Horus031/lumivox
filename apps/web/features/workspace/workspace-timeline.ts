import { Temporal } from "@js-temporal/polyfill";
import { getTaskBoardStatus } from "@/features/tasks/task-transition";
import type { WorkspaceTimelineTask } from "./workspace.types";

const PERIOD_DAYS = 28;

function parseDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return null;
  try {
    return Temporal.PlainDate.from(value);
  } catch {
    return null;
  }
}

function monday(date: Temporal.PlainDate) {
  return date.subtract({ days: date.dayOfWeek - 1 });
}

export function getWorkspaceTimelinePeriod(requested: string | undefined, now: string, profileTimezone: string) {
  const instant = Temporal.Instant.from(now);
  let timezone = profileTimezone;
  let today: Temporal.PlainDate;
  try {
    today = instant.toZonedDateTimeISO(timezone).toPlainDate();
  } catch {
    timezone = "UTC";
    today = instant.toZonedDateTimeISO(timezone).toPlainDate();
  }

  const start = monday(parseDate(requested) ?? today);
  const next = start.add({ days: PERIOD_DAYS });
  return {
    timezone,
    start: start.toString(),
    end: next.subtract({ days: 1 }).toString(),
    previous: parseDate(start.subtract({ days: PERIOD_DAYS }).toString())?.toString(),
    next: parseDate(next.toString())?.toString(),
    current: monday(today).toString(),
    today: today.toString(),
    fromInstant: start.toZonedDateTime(timezone).toInstant().toString(),
    untilInstant: next.toZonedDateTime(timezone).toInstant().toString(),
    days: Array.from({ length: PERIOD_DAYS }, (_, index) => start.add({ days: index }).toString()),
  };
}

export type WorkspaceTimelinePeriod = ReturnType<typeof getWorkspaceTimelinePeriod>;

export function projectWorkspaceTimelineTask(task: WorkspaceTimelineTask, period: WorkspaceTimelinePeriod, now: Date) {
  const start = Temporal.PlainDate.from(period.start);
  const offset = (date: string) => start.until(Temporal.PlainDate.from(date)).days;
  const schedule = task.schedule[0];
  const due = task.due_at
    ? Temporal.Instant.from(task.due_at).toZonedDateTimeISO(period.timezone).toPlainDate().toString()
    : task.due_date;
  const dueOffset = due ? offset(due) : -1;
  const from = schedule ? Math.max(0, offset(schedule.starts_on)) : 0;
  const to = schedule ? Math.min(PERIOD_DAYS - 1, offset(schedule.ends_on)) : -1;

  return {
    id: task.id,
    title: task.title,
    status: getTaskBoardStatus(task, now),
    schedule: schedule && from <= to ? {
      start: schedule.starts_on,
      end: schedule.ends_on,
      status: schedule.status,
      from,
      to,
    } : null,
    due: due && dueOffset >= 0 && dueOffset < PERIOD_DAYS ? { date: due, offset: dueOffset } : null,
  };
}

export type WorkspaceTimelineRow = ReturnType<typeof projectWorkspaceTimelineTask>;

export function getWorkspaceTimelineLabels(period: WorkspaceTimelinePeriod, rows: WorkspaceTimelineRow[], locale: string) {
  // ICU versions can format the same date differently on the server and browser.
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const shortDate = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  const asDate = (date: string) => new Date(`${date}T12:00:00Z`);
  const dates = new Set<string>();
  for (const { schedule, due } of rows) {
    if (schedule) {
      dates.add(schedule.start);
      dates.add(schedule.end);
    }
    if (due) dates.add(due.date);
  }
  return {
    range: fullDate.formatRange(asDate(period.start), asDate(period.end)),
    weeks: period.days.filter((_, index) => index % 7 === 0).map((day) => shortDate.format(asDate(day))),
    dates: Object.fromEntries(Array.from(dates, (date) => [date, fullDate.format(asDate(date))])),
  };
}

export type WorkspaceTimelineLabels = ReturnType<typeof getWorkspaceTimelineLabels>;
