"use server";

import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import type { StudyScheduleInput } from "./schedule-engine";

export async function getStudyScheduleEditorAction(
  rawScheduleId: unknown,
): Promise<
  | {
      success: true;
      revision: number;
      draft: StudyScheduleInput;
    }
  | {
      success: false;
      message: string;
    }
> {
  const parsed = z.string().uuid().safeParse(rawScheduleId);

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid schedule ID.",
    };
  }

  try {
    const { supabase, user } = await requireUser();

    const { data: schedule, error } = await supabase
      .from("task_study_schedules")
      .select("id, status, revision, starts_on, ends_on, timezone")
      .eq("id", parsed.data)
      .eq("user_id", user.id)
      .single();

    if (error || !schedule) {
      return {
        success: false,
        message: "Study schedule not found.",
      };
    }

    if (schedule.status !== "active") {
      return {
        success: false,
        message: "This schedule cannot be edited.",
      };
    }

    const { data: slots, error: slotsError } = await supabase
      .from("task_study_schedule_slots")
      .select("weekday, start_time, end_time")
      .eq("schedule_id", schedule.id)
      .eq("user_id", user.id)
      .order("weekday")
      .order("start_time");

    if (slotsError || !slots?.length) {
      return {
        success: false,
        message: "Could not load weekly slots.",
      };
    }

    // The slots and metadata use separate reads. Reject a mixed revision rather
    // than initializing an editor with slots from a different committed version.
    const { data: current, error: currentError } = await supabase
      .from("task_study_schedules")
      .select("revision, status")
      .eq("id", schedule.id)
      .eq("user_id", user.id)
      .single();
    if (currentError || !current || current.revision !== schedule.revision || current.status !== "active") {
      return { success: false, message: "Schedule changed while loading. Retry to load the latest version." };
    }

    return {
      success: true,
      revision: schedule.revision,
      draft: {
        startsOn: schedule.starts_on,
        endsOn: schedule.ends_on,
        timezone: schedule.timezone,
        slots: slots.map((slot) => ({
          weekday: slot.weekday,
          startTime: slot.start_time.slice(0, 5),
          endTime: slot.end_time.slice(0, 5),
        })),
      },
    };
  } catch {
    return {
      success: false,
      message: "Unable to load schedule editor.",
    };
  }
}
