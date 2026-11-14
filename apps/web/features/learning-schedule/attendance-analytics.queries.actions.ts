"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { calculateAttendanceSummary, type AnalyticsObligation } from "./attendance-analytics";

const inputSchema = z
  .object({
    scheduleId: z.string().uuid(),
  })
  .strict();

const PAGE_SIZE = 500;
const MAX_ROWS = 20_000;
const EVENT_CHUNK = 50;

function isSessionStatus(value: string): value is AnalyticsObligation["status"] {
  return ["scheduled", "in_progress", "completed", "missed", "skipped", "cancelled"].includes(
    value,
  );
}

type ProjectionResult =
  | {
      success: true;
      asOf: string;
      source: "application-server";
      summary: ReturnType<typeof calculateAttendanceSummary>;
    }
  | {
      success: false;
      code: "invalidInput" | "notAuthorized" | "loadFailed" | "incompleteData";
    };

export async function getAttendanceSummaryAction(raw: unknown): Promise<ProjectionResult> {
  const parsed = inputSchema.safeParse(raw);

  if (!parsed.success) {
    return { success: false, code: "invalidInput" };
  }

  try {
    const { supabase, user } = await requireUser();

    // Confirm the user owns this Schedule.
    const schedule = await supabase
      .from("task_study_schedules")
      .select("id")
      .eq("id", parsed.data.scheduleId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (schedule.error) {
      return { success: false, code: "loadFailed" };
    }

    if (!schedule.data) {
      return { success: false, code: "notAuthorized" };
    }

    const rows: Array<{
      id: string;
      schedule_id: string;
      logical_occurrence_key: string;
      local_date: string;
      timezone: string;
      scheduled_start_at: string;
      scheduled_end_at: string;
      status: AnalyticsObligation["status"];
      completed_at: string | null;
    }> = [];
    const sessionIds = new Set<string>();
    let total: number | undefined;

    // Every iteration remains owner-scoped by RLS
    // AND an explicit user_id predicate.
    for (let from = 0; from <= MAX_ROWS; from += PAGE_SIZE) {
      const result = await supabase
        .from("task_study_sessions")
        .select(
          "id,schedule_id,logical_occurrence_key,local_date,timezone,scheduled_start_at,scheduled_end_at,status,completed_at",
          { count: "exact" },
        )
        .eq("schedule_id", parsed.data.scheduleId)
        .eq("user_id", user.id)
        .order("scheduled_start_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (result.error || !result.data) {
        return { success: false, code: "loadFailed" };
      }

      if (
        result.count === null ||
        result.count > MAX_ROWS ||
        (total !== undefined && result.count !== total)
      ) {
        return { success: false, code: "incompleteData" };
      }
      total = result.count;
      // A short page is not proof of exhaustion: the server may impose a
      // lower row cap. Exact counts also detect changes in cardinality.
      if (result.data.length !== Math.min(PAGE_SIZE, Math.max(0, total - from))) {
        return { success: false, code: "incompleteData" };
      }
      for (const row of result.data) {
        if (sessionIds.has(row.id) || !isSessionStatus(row.status)) {
          return { success: false, code: "incompleteData" };
        }
        sessionIds.add(row.id);
        rows.push({ ...row, status: row.status });
      }

      if (rows.length === total) break;
    }

    // Query cancellations only for the fetched Sessions.
    // Do NOT trust updated_at as cancellation time.
    const cancellations = new Map<string, string>();

    for (let offset = 0; offset < rows.length; offset += EVENT_CHUNK) {
      const ids = rows.slice(offset, offset + EVENT_CHUNK).map((row) => row.id);

      let eventTotal: number | undefined;
      for (let from = 0; from <= MAX_ROWS; from += PAGE_SIZE) {
        const events = await supabase
          .from("task_study_session_events")
          .select("id,session_id,event_type,created_at", { count: "exact" })
          .eq("user_id", user.id)
          .eq("event_type", "cancelled")
          .in("session_id", ids)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (events.error || !events.data) {
          return { success: false, code: "loadFailed" };
        }
        if (
          events.count === null ||
          events.count > MAX_ROWS ||
          (eventTotal !== undefined && eventTotal !== events.count) ||
          events.data.length !== Math.min(PAGE_SIZE, Math.max(0, events.count - from))
        ) {
          return { success: false, code: "incompleteData" };
        }
        eventTotal = events.count;

        // A cancelled Session should have one terminal
        // cancellation audit. Ambiguous audit is not
        // silently collapsed.
        for (const event of events.data) {
          if (!ids.includes(event.session_id) || cancellations.has(event.session_id)) {
            return { success: false, code: "incompleteData" };
          }
          cancellations.set(event.session_id, event.created_at);
        }
        if (from + events.data.length === eventTotal) break;
      }
    }

    // A cancellation observed on only one side of these independent reads
    // indicates a partial/inconsistent projection; request a fresh read.
    if (rows.some((row) => (row.status === "cancelled") !== cancellations.has(row.id))) {
      return { success: false, code: "incompleteData" };
    }

    const obligations: AnalyticsObligation[] = rows.map((row) => ({
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
    }));

    // This is the application-server clock, not a
    // database timestamp or a historical snapshot.
    const asOf = new Date().toISOString();

    let summary: ReturnType<typeof calculateAttendanceSummary>;

    try {
      summary = calculateAttendanceSummary(obligations, asOf);
    } catch {
      return { success: false, code: "incompleteData" };
    }

    return {
      success: true,
      asOf,
      source: "application-server",
      summary,
    };
  } catch {
    return { success: false, code: "loadFailed" };
  }
}
