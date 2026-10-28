"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";

const schema = z.object({
  scheduleId: z.string().uuid(),
  page: z.number().int().min(0).max(1000),
}).strict();
const PAGE_SIZE = 20;

export async function getStudySessionsAction(raw: unknown) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { success: false as const, message: "Invalid sessions request." };

  try {
    const { supabase, user } = await requireUser();
    const { scheduleId, page } = parsed.data;
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error, count } = await supabase
      .from("task_study_sessions")
      .select(
        "id, local_date, local_start_time, local_end_time, timezone, status, schedule_revision, scheduled_start_at, scheduled_end_at, cancellation_reason, completed_at",
        { count: "exact" },
      )
      .eq("schedule_id", scheduleId)
      .eq("user_id", user.id)
      .order("scheduled_start_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) return { success: false as const, message: "Could not load study sessions." };
    return { success: true as const, sessions: data ?? [], total: count ?? 0,
      page, hasMore: to + 1 < (count ?? 0) };
  } catch {
    return { success: false as const, message: "Unable to load study sessions." };
  }
}
