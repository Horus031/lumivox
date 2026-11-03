import { Temporal } from "@js-temporal/polyfill";
import type { AnalyticsObligation } from "./attendance-analytics";

export type StudyPlanSession = {
  id: string; taskId: string; taskTitle: string; scheduleId: string;
  localDate: string; localStartTime: string; localEndTime: string;
  timezone: string; scheduledStartAt: string; status: AnalyticsObligation["status"];
};
export type CalendarDay = { localDate: string; sessions: StudyPlanSession[] };

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
  return [...sessions].sort((a, b) => Temporal.Instant.compare(a.scheduledStartAt, b.scheduledStartAt) || a.id.localeCompare(b.id));
}
/** Today is evaluated in EACH persisted Session timezone, never the device zone. */
export function getTodaysStudySessions(sessions: readonly StudyPlanSession[], asOf: string): StudyPlanSession[] {
  return ordered(sessions.filter(row => row.status !== "cancelled" && row.localDate === todayInTimezone(asOf, row.timezone)));
}
/** Calendar retains cancellation history, grouped by persisted local dates. */
export function groupStudyCalendar(sessions: readonly StudyPlanSession[], month: string): CalendarDay[] {
  calendarMonth(month);
  const days = new Map<string, StudyPlanSession[]>();
  for (const row of sessions) {
    if (row.localDate.slice(0, 7) !== month) continue;
    if (Temporal.PlainDate.from(row.localDate).toString() !== row.localDate) throw new Error("Invalid local date");
    const group = days.get(row.localDate) ?? [];
    group.push(row); days.set(row.localDate, group);
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([localDate, rows]) => ({ localDate, sessions: ordered(rows) }));
}
