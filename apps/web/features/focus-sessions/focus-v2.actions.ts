"use server";

import { z } from "zod";
import { AiApiError, fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";
import { scheduleEngagementRecalculation } from "@/features/engagement-retention/engagement-retention.background";
import { focusV2ConfigSchema, type FocusV2Config } from "./focus-v2-config.schemas";
import { getFocusV2Snapshot } from "./focus-v2.queries";
import type { FocusV2Action, FocusV2Snapshot, FocusV2TransitionResult } from "./focus-v2.types";

const transitionInputSchema = z.object({
  sessionId: z.uuid(),
  action: z.enum(["pause", "resume", "complete", "skip_break", "start_next", "cancel"]),
  expectedSegmentId: z.uuid().nullable(),
}).strict();
const snapshotIdSchema = z.uuid();

type CreateResponse = { session_id: string };

function isEnabled() {
  return process.env.FOCUS_V2_ENABLED === "true";
}

function errorMessage(error: unknown): string {
  if (error instanceof AiApiError) {
    if (error.status === 409) return "Session state changed. Please refresh.";
    if (error.status === 400) return "Invalid Focus V2 transition.";
  }
  return "Focus V2 is unavailable. Please try again.";
}

export async function createFocusV2SessionAction(
  input: FocusV2Config,
): Promise<ActionResult<{ sessionId: string }>> {
  if (!isEnabled()) return { success: false, message: "Focus V2 is not enabled." };
  const parsed = focusV2ConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Invalid Focus V2 configuration.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const { user } = await requireUser();
    const config = parsed.data;
    const response = await fetchAiApi<CreateResponse>({
      path: "/api/v1/focus-v2/create",
      body: {
        user_id: user.id,
        task_id: config.taskId || null,
        focus_minutes: config.focusMinutes,
        short_break_minutes: config.shortBreakMinutes,
        long_break_minutes: config.longBreakMinutes,
        round_count: config.roundCount,
        long_break_every: config.longBreakEvery,
        auto_start_breaks: config.autoStartBreaks,
        auto_start_focus: config.autoStartFocus,
      },
      retries: 0,
    });
    if (!z.uuid().safeParse(response.session_id).success) throw new Error("Invalid create response.");
    return { success: true, message: "Focus V2 session created.", data: { sessionId: response.session_id } };
  } catch (error) {
    return { success: false, message: errorMessage(error) };
  }
}

export async function loadFocusV2SnapshotAction(
  sessionId: string,
): Promise<ActionResult<FocusV2Snapshot>> {
  if (!isEnabled()) return { success: false, message: "Focus V2 is not enabled." };
  if (!snapshotIdSchema.safeParse(sessionId).success) return { success: false, message: "Invalid session ID." };
  try {
    const snapshot = await getFocusV2Snapshot(sessionId);
    if (!snapshot) return { success: false, message: "Focus V2 session not found." };
    return { success: true, message: "Focus V2 session loaded.", data: snapshot };
  } catch {
    return { success: false, message: "Could not load Focus V2 session." };
  }
}

export async function transitionFocusV2Action(
  input: { sessionId: string; action: FocusV2Action; expectedSegmentId: string | null },
): Promise<ActionResult<FocusV2TransitionResult>> {
  if (!isEnabled()) return { success: false, message: "Focus V2 is not enabled." };
  const parsed = transitionInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Invalid Focus V2 transition." };
  const { sessionId, action, expectedSegmentId } = parsed.data;
  if (action !== "cancel" && !expectedSegmentId) {
    return { success: false, message: "Segment ID is required." };
  }
  try {
    const { user } = await requireUser();
    // Service-role RPC validates ownership again under a serialized row lock.
    const result = await fetchAiApi<FocusV2TransitionResult>({
      path: "/api/v1/focus-v2/transition",
      body: {
        user_id: user.id,
        session_id: sessionId,
        action,
        expected_segment_id: expectedSegmentId,
      },
      retries: 0,
    });
    if (!result || typeof result.parentCompleted !== "boolean" || !result.parentStatus) {
      throw new Error("Unexpected transition response.");
    }
    if (result.parentCompleted && result.parentStatus === "completed") {
      scheduleEngagementRecalculation({
        userId: user.id,
        source: "focus-completion",
        activity: { type: "focus_session", id: sessionId },
      });
    }
    return { success: true, message: "Focus V2 transition applied.", data: result };
  } catch (error) {
    return { success: false, message: errorMessage(error) };
  }
}
