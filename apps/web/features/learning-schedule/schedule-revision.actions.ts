"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { generateStudyOccurrences } from "./schedule-engine";

const slotSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).strict();

const schema = z.object({
  scheduleId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  startsOn: z.string(),
  endsOn: z.string(),
  timezone: z.string(),
  slots: z.array(slotSchema).min(1).max(21),
}).strict();

export async function reviseStudyScheduleAction(raw: unknown): Promise<
  | { success: true; revision: number; sessionCount: number }
  | { success: false; message: string; conflict?: boolean }
> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { success: false, message: "Invalid schedule input." };

  try {
    const { supabase, user } = await requireUser();
    const { scheduleId, expectedRevision, ...schedule } = parsed.data;
    const occurrences = generateStudyOccurrences(schedule);
    if (!occurrences.length) return { success: false, message: "No study sessions match this schedule." };

    // Helpful early check. The RPC still locks and checks ownership atomically.
    const { data: existing, error: readError } = await supabase
      .from("task_study_schedules")
      .select("id, user_id, revision")
      .eq("id", scheduleId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError || !existing) return { success: false, message: "Schedule not found." };
    if (existing.revision !== expectedRevision) return {
      success: false, message: "Schedule changed elsewhere. Reload before editing.", conflict: true,
    };

    // Bound the HTTP request: local PostgREST can keep retrying a deliberate
    // serialization error. A failed/aborted response must never report success.
    const { data, error } = await supabase.rpc("ls_revise_schedule", {
      p_schedule_id: scheduleId,
      p_expected_revision: expectedRevision,
      p_starts_on: schedule.startsOn,
      p_ends_on: schedule.endsOn,
      p_timezone: schedule.timezone,
      p_slots: schedule.slots,
      p_occurrences: occurrences,
    }).abortSignal(AbortSignal.timeout(5000));
    if (error) {
      if (error.code === "40001") return {
        success: false, conflict: true, message: "Schedule changed elsewhere. Reload before editing.",
      };
      const { data: current, error: currentError } = await supabase
        .from("task_study_schedules").select("revision")
        .eq("id", scheduleId).eq("user_id", user.id).maybeSingle();
      if (!currentError && current && current.revision !== expectedRevision) return {
        success: false, conflict: true, message: "Schedule changed elsewhere. Reload before editing.",
      };
      return { success: false, message: "Could not update schedule. Check future dates and active sessions." };
    }
    return { success: true, revision: data, sessionCount: occurrences.length };
  } catch {
    return { success: false, message: "Unable to update study schedule." };
  }
}
