import { Temporal } from "@js-temporal/polyfill";
import type { AnalyticsObligation } from "./attendance-analytics";
import type { StudyFocusEffort } from "./study-focus-effort";

export type StudyPlanSession = {
  id: string; taskId: string; taskTitle: string; scheduleId: string;
  localDate: string; localStartTime: string; localEndTime: string;
  timezone: string; scheduledStartAt: string; status: AnalyticsObligation["status"];
  canLaunchFocus?: boolean;
  plannedMinutes?: number;
};
export type CalendarDay = { localDate: string; sessions: StudyPlanSession[] };
export type StudyPlanDisplaySession = Omit<StudyPlanSession, "scheduleId" | "scheduledStartAt"> & {
  recordedFocus?: Pick<StudyFocusEffort, "recordedMinutes" | "hasActiveFocus">;
};
export type StudyPlanDisplayDay = { localDate: string; sessions: StudyPlanDisplaySession[] };

export function todayInTimezone(asOf: string, timezone: string): string {
  return Temporal.Instant.from(asOf).toZonedDateTimeISO(timezone).toPlainDate().toString();
}
export function calendarMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid calendar month");
  const parsed = Temporal.PlainYearMonth.from(month);
  if (parsed.toString() !== month) throw new Error("Noncanonical calendar month");
  return parsed;
}
function ordered(sessions: readonly StudyPlanSession[]): StudyPlanSession[] {
  return sessions.map(row => ({ row, instant: Temporal.Instant.from(row.scheduledStartAt).epochNanoseconds }))
    .sort((a, b) => a.instant < b.instant ? -1 : a.instant > b.instant ? 1 : a.row.id.localeCompare(b.row.id))
    .map(entry => entry.row);
}
/** Today is evaluated in EACH persisted Session timezone, never the device zone. */
export function getTodaysStudySessions(sessions: readonly StudyPlanSession[], asOf: string): StudyPlanSession[] {
  const dates = new Map<string, string>();
  return ordered(sessions.filter(row => {
    if (row.status === "cancelled") return false;
    let today = dates.get(row.timezone);
    if (today === undefined) {
      today = todayInTimezone(asOf, row.timezone);
      dates.set(row.timezone, today);
    }
    return row.localDate === today;
  }));
}
/** Calendar retains cancellation history, grouped by persisted local dates. */
export function groupStudyCalendar(sessions: readonly StudyPlanSession[], month: string): CalendarDay[] {
  calendarMonth(month);
  const days = new Map<string, StudyPlanSession[]>();
  for (const row of sessions) {
    if (row.localDate.slice(0, 7) !== month) continue;
    const group = days.get(row.localDate) ?? [];
    if (!group.length && Temporal.PlainDate.from(row.localDate).toString() !== row.localDate) throw new Error("Invalid local date");
    group.push(row); days.set(row.localDate, group);
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([localDate, rows]) => ({ localDate, sessions: ordered(rows) }));
}
