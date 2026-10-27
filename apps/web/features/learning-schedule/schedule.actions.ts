"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { generateStudyOccurrences } from "./schedule-engine";

const slot = z.object({
  weekday: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).strict();
const inputSchema = z.object({
  taskId: z.string().uuid(),
  startsOn: z.string(),
  endsOn: z.string(),
  timezone: z.string(),
  slots: z.array(slot).min(1).max(21),
}).strict();

export async function createStudyScheduleAction(raw: unknown): Promise<
  { success: true; scheduleId: string; sessionCount: number } |
  { success: false; message: string }
> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { success: false, message: "Invalid study schedule input." };
  try {
    const { supabase, user } = await requireUser();
    const { taskId, ...schedule } = parsed.data;
    const occurrences = generateStudyOccurrences(schedule);
    if (!occurrences.length) return { success: false, message: "No study sessions match this date range." };
    const { data: task, error: taskError } = await supabase.from("tasks")
      .select("id,user_id,parent_task_id,status")
      .eq("id", taskId).eq("user_id", user.id).maybeSingle();
    if (taskError || !task || task.parent_task_id !== null ||
        !["todo", "in_progress"].includes(task.status)) {
      return { success: false, message: "Task is not eligible for scheduling." };
    }
    const { data, error } = await supabase.rpc("ls_create_schedule", {
      p_task_id: taskId,
      p_starts_on: schedule.startsOn,
      p_ends_on: schedule.endsOn,
      p_timezone: schedule.timezone,
      p_slots: schedule.slots,
      p_occurrences: occurrences,
    });
    if (error || !data) {
      // Do not expose raw database error messages to unauthenticated callers.
      return { success: false, message: "Could not create study schedule. Check that the task has no active schedule and the dates are valid." };
    }
    return { success: true, scheduleId: data, sessionCount: occurrences.length };
  } catch {
    return { success: false, message: "Unable to create the study schedule." };
  }
}
