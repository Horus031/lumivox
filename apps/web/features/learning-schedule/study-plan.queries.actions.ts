"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { calculateAttendanceSummary, type AttendanceSummary } from "./attendance-analytics";
import {
  calendarMonth,
  getTodaysStudySessions,
  groupStudyCalendar,
  type CalendarDay,
  type StudyPlanSession,
} from "./study-plan-projection";
import { studyPlanTiming } from "./study-plan-timing";

const inputSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).strict();
const sessionSchema = z.object({
  id: z.string().uuid(),
  task_id: z.string().uuid(),
  schedule_id: z.string().uuid(),
  logical_occurrence_key: z.string(),
  local_date: z.string(),
  local_start_time: z.string(),
  local_end_time: z.string(),
  timezone: z.string(),
  scheduled_start_at: z.string(),
  scheduled_end_at: z.string(),
  completed_at: z.string().nullable(),
  status: z.enum(["scheduled", "in_progress", "completed", "missed", "skipped", "cancelled"]),
  schedule_revision: z.number().int(),
  schedule: z.object({ status: z.string(), revision: z.number().int() }).nullable(),
});
const PAGE = 500,
  MAX_ROWS = 20_000,
  CHUNK = 50,
  MAX_OUTPUT = 2_000;
type FailureCode = "invalidInput" | "loadFailed" | "incompleteData";
class ReadFailure extends Error {
  constructor(readonly code: FailureCode) {
    super(code);
  }
}
type PageResult<T> = { data: T[] | null; error: unknown; count: number | null };
async function allPages<T extends { id: string }>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [],
    ids = new Set<string>();
  const first = await fetchPage(0, PAGE - 1);
  if (first.error || !first.data) throw new ReadFailure("loadFailed");
  const total = first.count ?? -1;
  if (total < 0 || total > MAX_ROWS) throw new ReadFailure("incompleteData");
  function append(result: PageResult<T>, from: number) {
    if (result.error || !result.data) throw new ReadFailure("loadFailed");
    if (result.count !== total || result.data.length !== Math.min(PAGE, total - from)) {
      throw new ReadFailure("incompleteData");
    }
    for (const row of result.data) {
      if (ids.has(row.id)) throw new ReadFailure("incompleteData");
      ids.add(row.id);
      rows.push(row);
    }
  }
  append(first, 0);
  for (let from = PAGE; from < total; from += 2 * PAGE) {
    const offsets = [from, from + PAGE].filter((offset) => offset < total);
    const pages = await Promise.all(offsets.map((offset) => fetchPage(offset, offset + PAGE - 1)));
    pages.forEach((page, i) => append(page, offsets[i]));
  }
  return rows;
}
export type StudyPlanResult =
  | {
      success: true;
      asOf: string;
      source: "application-server";
      today: StudyPlanSession[];
      calendar: CalendarDay[];
      summary: AttendanceSummary;
    }
  | { success: false; code: FailureCode };

/** Best-effort current-state read, not a shared PostgreSQL snapshot. */
export async function getStudyPlanAction(raw: unknown): Promise<StudyPlanResult> {
  const input = inputSchema.safeParse(raw);
  if (!input.success) return { success: false, code: "invalidInput" };
  try {
    calendarMonth(input.data.month);
  } catch {
    return { success: false, code: "invalidInput" };
  }
  const timing = studyPlanTiming("plan");
  try {
    const { supabase, user } = await requireUser();
    timing.mark("auth");
    // Read all history to cover Today's Plan across every IANA zone and to
    // aggregate obligations correctly. No unproven UTC envelope or N+1 summaries.
    const fetched = await allPages((from, to) =>
      supabase
        .from("task_study_sessions")
        .select(
          "id,task_id,schedule_id,logical_occurrence_key,local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at,status,completed_at,schedule_revision,schedule:task_study_schedules!ls_session_schedule_task_owner_fk(status,revision)",
          { count: "exact" },
        )
        .eq("user_id", user.id)
        .order("scheduled_start_at")
        .order("id")
        .range(from, to),
    );
    const parsed = z.array(sessionSchema).safeParse(fetched);
    if (!parsed.success) throw new ReadFailure("incompleteData");
    const rows = parsed.data;
    timing.mark("sessions");
    const titles = new Map<string, string>();
    const eligibleTasks = new Set<string>();
    const taskIds = [...new Set(rows.map((row) => row.task_id))];
    const [, events] = await Promise.all([
      timing.measure("tasks", async () => {
        for (let offset = 0; offset < taskIds.length; offset += CHUNK) {
          const ids = taskIds.slice(offset, offset + CHUNK);
          const tasks = await allPages((from, to) =>
            supabase
              .from("tasks")
              .select("id,title,status,parent_task_id", { count: "exact" })
              .eq("user_id", user.id)
              .in("id", ids)
              .order("id")
              .range(from, to),
          );
          for (const task of tasks) {
            if (!ids.includes(task.id)) throw new ReadFailure("incompleteData");
            titles.set(task.id, task.title);
            if (
              task.parent_task_id === null &&
              (task.status === "todo" || task.status === "in_progress")
            ) {
              eligibleTasks.add(task.id);
            }
          }
          if (tasks.length !== ids.length) throw new ReadFailure("incompleteData");
        }
      }),
      // Include contradictory audits on non-cancelled sessions so the same
      // completeness checks apply without one request per chunk of Study IDs.
      timing.measure("audits", () =>
        allPages((from, to) =>
          supabase
            .from("task_study_session_events")
            .select("id,session_id,created_at", { count: "exact" })
            .eq("user_id", user.id)
            .eq("event_type", "cancelled")
            .order("created_at")
            .order("id")
            .range(from, to),
        ),
      ),
    ]);
    const cancellations = new Map<string, string>();
    const sessionIds = new Set(rows.map((row) => row.id));
    for (const event of events) {
      if (!sessionIds.has(event.session_id) || cancellations.has(event.session_id))
        throw new ReadFailure("incompleteData");
      cancellations.set(event.session_id, event.created_at);
    }
    if (rows.some((row) => (row.status === "cancelled") !== cancellations.has(row.id)))
      throw new ReadFailure("incompleteData");
    timing.mark("related");
    const asOf = new Date().toISOString();
    try {
      const sessions: StudyPlanSession[] = rows.map((row) => ({
        id: row.id,
        taskId: row.task_id,
        taskTitle: titles.get(row.task_id)!,
        scheduleId: row.schedule_id,
        localDate: row.local_date,
        localStartTime: row.local_start_time,
        localEndTime: row.local_end_time,
        timezone: row.timezone,
        scheduledStartAt: row.scheduled_start_at,
        status: row.status,
        plannedMinutes: Math.floor(
          (Date.parse(row.scheduled_end_at) - Date.parse(row.scheduled_start_at)) / 60_000,
        ),
        canLaunchFocus:
          eligibleTasks.has(row.task_id) &&
          row.schedule?.status === "active" &&
          row.schedule.revision === row.schedule_revision &&
          (row.status === "scheduled" || row.status === "in_progress") &&
          Date.parse(asOf) >= Date.parse(row.scheduled_start_at) - 15 * 60_000 &&
          Date.parse(asOf) < Date.parse(row.scheduled_end_at),
      }));
      const today = getTodaysStudySessions(sessions, asOf);
      const calendar = groupStudyCalendar(sessions, input.data.month);
      // Bound serialized output. Never silently truncate either view.
      if (today.length + calendar.reduce((n, day) => n + day.sessions.length, 0) > MAX_OUTPUT)
        throw new ReadFailure("incompleteData");
      const summary = calculateAttendanceSummary(
        rows.map((row) => ({
          id: row.id,
          scheduleId: row.schedule_id,
          logicalOccurrenceKey: row.logical_occurrence_key,
          localDate: row.local_date,
          timezone: row.timezone,
          scheduledStartAt: row.scheduled_start_at,
          scheduledEndAt: row.scheduled_end_at,
          status: row.status,
          completedAt: row.completed_at,
          cancelledAt: cancellations.get(row.id) ?? null,
        })),
        asOf,
      );
      timing.mark("projection");
      return { success: true, asOf, source: "application-server", today, calendar, summary };
    } catch {
      throw new ReadFailure("incompleteData");
    }
  } catch (error) {
    return { success: false, code: error instanceof ReadFailure ? error.code : "loadFailed" };
  } finally {
    timing.finish();
  }
}
