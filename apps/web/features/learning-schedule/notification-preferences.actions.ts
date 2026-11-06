"use server";
import { requireUser } from "@/lib/auth/require-user";
import type { Database } from "@/types/database.types";
import { studyNotificationPreferencesSchema, studyNotificationTaskOverrideSchema, type StudyNotificationPreferences } from "./notification-preferences.schemas";
import { z } from "zod";

type Failure = { success: false; code: "invalidInput" | "notAuthorized" | "loadFailed" | "saveFailed" | "conflictRetryable" };
type PreferencesResult = { success: true; preferences: StudyNotificationPreferences } | Failure;
type Row = Database["public"]["Tables"]["study_notification_preferences"]["Row"];
function normalize(row: Row | null): StudyNotificationPreferences {
  return { studyEmailEnabled: row?.study_email_enabled ?? false, leadMinutes: row?.lead_minutes ?? 15,
    quietHoursEnabled: row?.quiet_hours_enabled ?? false, quietStartLocal: row?.quiet_start_local?.slice(0, 5) ?? null,
    quietEndLocal: row?.quiet_end_local?.slice(0, 5) ?? null, timezone: row?.timezone ?? null,
    consentedAt: row?.consented_at ?? null, updatedAt: row?.updated_at ?? null,
    reminderLocale: row?.reminder_locale === "en" || row?.reminder_locale === "vi" ? row.reminder_locale : null,
    localeConfirmedAt: row?.locale_confirmed_at ?? null };
}
function failure(code: string): Failure {
  return { success: false, code: code === "55P03" ? "conflictRetryable" : code === "42501" ? "notAuthorized" : code.startsWith("22") || code === "23514" ? "invalidInput" : "saveFailed" };
}
export async function getStudyNotificationTaskOverrideAction(raw: unknown): Promise<
  { success: true; override: { taskId: string; enabled: boolean }; globalEnabled: boolean } | Failure
> {
  const parsed = studyNotificationTaskOverrideSchema.pick({ taskId: true }).safeParse(raw);
  if (!parsed.success) return { success: false, code: "invalidInput" };
  let context;
  try { context = await requireUser(); } catch { return { success: false, code: "notAuthorized" }; }
  try {
    const { supabase, user } = context;
    const task = await supabase.from("tasks").select("id").eq("user_id", user.id).eq("id", parsed.data.taskId).maybeSingle();
    if (task.error) return { success: false, code: "loadFailed" };
    if (!task.data) return { success: false, code: "notAuthorized" };
    const [override, preference] = await Promise.all([
      supabase.from("study_notification_task_overrides").select("enabled").eq("user_id", user.id).eq("task_id", parsed.data.taskId).maybeSingle(),
      supabase.from("study_notification_preferences").select("study_email_enabled").eq("user_id", user.id).maybeSingle(),
    ]);
    if (override.error || preference.error) return { success: false, code: "loadFailed" };
    return { success: true, override: { taskId: parsed.data.taskId, enabled: override.data?.enabled ?? true }, globalEnabled: preference.data?.study_email_enabled ?? false };
  } catch { return { success: false, code: "loadFailed" }; }
}
export async function getStudyNotificationPreferencesAction(): Promise<PreferencesResult> {
  let context;
  try { context = await requireUser(); } catch { return { success: false, code: "notAuthorized" }; }
  try {
    const result = await context.supabase.from("study_notification_preferences").select("*").eq("user_id", context.user.id).maybeSingle();
    if (result.error) return { success: false, code: "loadFailed" };
    // A missing row is opt-out; reading never inserts a preference or consent.
    return { success: true, preferences: normalize(result.data) };
  } catch { return { success: false, code: "loadFailed" }; }
}
export async function saveStudyReminderLocaleAction(raw:unknown):Promise<PreferencesResult> {
  const parsed=z.object({locale:z.enum(["en","vi"])}).strict().safeParse(raw);
  if(!parsed.success) return {success:false,code:"invalidInput"};
  let context;try{context=await requireUser();}catch{return {success:false,code:"notAuthorized"};}
  try {
    const {data,error}=await context.supabase.rpc("ls_set_study_reminder_locale",{p_locale:parsed.data.locale}).abortSignal(AbortSignal.timeout(5000));
    if(error) return failure(error.code);
    return data?{success:true,preferences:normalize(data)}:{success:false,code:"saveFailed"};
  }catch{return {success:false,code:"saveFailed"};}
}
export async function saveStudyNotificationPreferencesAction(raw: unknown): Promise<PreferencesResult> {
  const parsed = studyNotificationPreferencesSchema.safeParse(raw);
  if (!parsed.success) return { success: false, code: "invalidInput" };
  let context;
  try { context = await requireUser(); } catch { return { success: false, code: "notAuthorized" }; }
  try {
    const input = parsed.data;
    const result = await context.supabase.rpc("ls_set_study_notification_preferences", {
      p_study_email_enabled: input.studyEmailEnabled, p_lead_minutes: input.leadMinutes,
      p_quiet_hours_enabled: input.quietHoursEnabled, p_quiet_start_local: input.quietStartLocal ?? undefined,
      p_quiet_end_local: input.quietEndLocal ?? undefined, p_timezone: input.timezone ?? undefined,
    }).abortSignal(AbortSignal.timeout(5000));
    if (result.error) return failure(result.error.code);
    if (!result.data) return { success: false, code: "saveFailed" };
    return { success: true, preferences: normalize(result.data) };
  } catch { return { success: false, code: "saveFailed" }; }
}
export async function saveStudyNotificationTaskOverrideAction(raw: unknown): Promise<
  { success: true; override: { taskId: string; enabled: boolean } } | Failure
> {
  const parsed = studyNotificationTaskOverrideSchema.safeParse(raw);
  if (!parsed.success) return { success: false, code: "invalidInput" };
  let context;
  try { context = await requireUser(); } catch { return { success: false, code: "notAuthorized" }; }
  try {
    const result = await context.supabase.rpc("ls_set_study_notification_task_override", {
      p_task_id: parsed.data.taskId, p_enabled: parsed.data.enabled,
    }).abortSignal(AbortSignal.timeout(5000));
    if (result.error) return failure(result.error.code);
    if (!result.data) return { success: false, code: "saveFailed" };
    return { success: true, override: { taskId: result.data.task_id, enabled: result.data.enabled } };
  } catch { return { success: false, code: "saveFailed" }; }
}
