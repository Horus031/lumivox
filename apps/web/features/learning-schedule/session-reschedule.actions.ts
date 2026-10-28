"use server";

import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";

const schema = z.object({
  sessionId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  eventKey: z.string().uuid(),
}).strict();

function localToInstant(date: string, time: string, timezone: string): string {
  const plain = Temporal.PlainDate.from(date, { overflow: "reject" });
  if (plain.toString() !== date) throw new Error("Invalid date");
  const [hour, minute] = time.split(":").map(Number);
  const zoned = Temporal.ZonedDateTime.from({
    timeZone: timezone, year: plain.year, month: plain.month, day: plain.day, hour, minute,
  }, { disambiguation: "earlier", overflow: "reject" });
  if (zoned.toPlainDate().toString() !== date || zoned.hour !== hour || zoned.minute !== minute) {
    throw new Error("Nonexistent local time due to daylight saving change");
  }
  return zoned.toInstant().toString();
}

export async function rescheduleStudySessionAction(raw: unknown): Promise<
  {success:true;sessionId:string}|{success:false;message:string;conflict?:boolean;uncertain?:boolean}
> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success || parsed.data.startTime >= parsed.data.endTime) return {success:false,message:"Invalid reschedule input."};
  let dispatched = false;
  try {
    const {supabase,user} = await requireUser();
    const p = parsed.data;
    const {data:session,error:sessionError} = await supabase
      .from("task_study_sessions").select("id,schedule_id")
      .eq("id",p.sessionId).eq("user_id",user.id).maybeSingle();
    if (sessionError || !session) return {success:false,message:"Study session not found."};
    const {data:schedule,error:scheduleError} = await supabase
      .from("task_study_schedules").select("timezone")
      .eq("id",session.schedule_id).eq("user_id",user.id).maybeSingle();
    if (scheduleError || !schedule) return {success:false,message:"Study schedule not found."};
    const startAt = localToInstant(p.localDate,p.startTime,schedule.timezone);
    const endAt = localToInstant(p.localDate,p.endTime,schedule.timezone);
    dispatched = true;
    const {data,error} = await supabase.rpc("ls_reschedule_session",{
      p_session_id:p.sessionId,p_expected_updated_at:p.expectedUpdatedAt,
      p_new_local_date:p.localDate,p_new_start_time:p.startTime,p_new_end_time:p.endTime,
      p_new_start_at:startAt,p_new_end_at:endAt,p_event_key:p.eventKey,
    }).abortSignal(AbortSignal.timeout(5000));
    if (error && !error.code) {
      // An HTTP abort cannot establish whether the transaction committed.
      // Keep the original command retryable; never silently change its version.
      const { data: current } = await supabase.from("task_study_sessions").select("updated_at")
        .eq("id", p.sessionId).eq("user_id", user.id)
        .abortSignal(AbortSignal.timeout(3000)).maybeSingle();
      return { success: false, uncertain: true,
        conflict: Boolean(current && Temporal.Instant.compare(current.updated_at, p.expectedUpdatedAt) !== 0),
        message: "The result could not be confirmed. Check the latest session or retry the exact same command." };
    }
    if (error) return {success:false,conflict:error.code==="40001",message:
      error.code==="40001"?"Study session was changed elsewhere. Reload before editing.":
      "Unable to reschedule this study session."};
    return {success:true,sessionId:data};
  } catch {return {success:false, uncertain: dispatched,
    message: dispatched ? "The result could not be confirmed. Check the latest session or retry the exact same command." : "Unable to reschedule this study session."};}
}
