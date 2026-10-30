"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";

export async function getTaskStudyScheduleAction(rawTaskId: unknown) {
  const parsed = z.string().uuid().safeParse(rawTaskId);

  if (!parsed.success) {
    return {
      success: false as const, code: "invalidInput" as const,
      message: "Invalid task ID.",
    };
  }

  try {
    const { supabase, user } = await requireUser();

    const { data, error } = await supabase
      .from("task_study_schedules")
      .select("id, task_id, status, revision, starts_on, ends_on, timezone")
      .eq("task_id", parsed.data)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        success: false as const, code: "loadFailed" as const,
        message: "Could not load study schedule.",
      };
    }

    return {
      success: true as const,
      schedule: data,
    };
  } catch {
    return {
      success: false as const, code: "loadFailed" as const,
      message: "Unable to load study schedule.",
    };
  }
}
