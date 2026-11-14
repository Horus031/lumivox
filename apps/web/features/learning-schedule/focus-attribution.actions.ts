"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import type { Database } from "@/types/database.types";

const linkSchema = z.object({ studySessionId: z.uuid(), focusSessionId: z.uuid() }).strict();
const readSchema = linkSchema.pick({ studySessionId: true });
type Failure = {
  success: false;
  code:
    | "invalidInput"
    | "notAuthorized"
    | "notFound"
    | "conflict"
    | "conflictRetryable"
    | "loadFailed"
    | "saveFailed"
    | "uncertain";
};
type Attribution = Database["public"]["Tables"]["task_study_focus_attributions"]["Row"];
export async function getStudyFocusAttributionsAction(
  raw: unknown,
): Promise<{ success: true; attributions: Attribution[]; hasMore: boolean } | Failure> {
  const parsed = readSchema.safeParse(raw);
  if (!parsed.success) return { success: false, code: "invalidInput" };
  let context;
  try {
    context = await requireUser();
  } catch {
    return { success: false, code: "notAuthorized" };
  }
  try {
    const { supabase, user } = context;
    const session = await supabase
      .from("task_study_sessions")
      .select("id")
      .eq("id", parsed.data.studySessionId)
      .eq("user_id", user.id)
      .abortSignal(AbortSignal.timeout(4000))
      .maybeSingle();
    if (session.error) return { success: false, code: "loadFailed" };
    if (!session.data) return { success: false, code: "notFound" };
    const { data, error } = await supabase
      .from("task_study_focus_attributions")
      .select(
        "id,user_id,task_id,study_session_id,focus_session_id,attribution_source,created_at,updated_at",
      )
      .eq("user_id", user.id)
      .eq("study_session_id", parsed.data.studySessionId)
      .order("created_at")
      .order("id")
      .limit(201)
      .abortSignal(AbortSignal.timeout(4000));
    if (error) return { success: false, code: "loadFailed" };
    return {
      success: true,
      attributions: (data ?? []).slice(0, 200),
      hasMore: (data?.length ?? 0) > 200,
    };
  } catch {
    return { success: false, code: "loadFailed" };
  }
}
export async function linkStudyFocusAction(
  raw: unknown,
): Promise<{ success: true; attributionId: string } | Failure> {
  const parsed = linkSchema.safeParse(raw);
  if (!parsed.success) return { success: false, code: "invalidInput" };
  let context;
  try {
    context = await requireUser();
  } catch {
    return { success: false, code: "notAuthorized" };
  }
  try {
    const { data, error } = await context.supabase
      .rpc("ls_link_study_focus", {
        p_study_session_id: parsed.data.studySessionId,
        p_focus_session_id: parsed.data.focusSessionId,
      })
      .abortSignal(AbortSignal.timeout(5000));
    if (error)
      return {
        success: false,
        code:
          error.code === "23505"
            ? "conflict"
            : error.code === "55P03"
              ? "conflictRetryable"
              : error.code === "42501"
                ? "notAuthorized"
                : error.code === "22023"
                  ? "invalidInput"
                  : !error.code
                    ? "uncertain"
                    : "saveFailed",
      };
    return data ? { success: true, attributionId: data } : { success: false, code: "uncertain" };
  } catch {
    return { success: false, code: "uncertain" };
  } // never create another Focus on unknown outcome
}
