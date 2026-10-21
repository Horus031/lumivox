"use server";

import { scheduleEngagementRecalculation } from "@/features/engagement-retention/engagement-retention.background";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";

import {
  createFocusSessionSchema,
  sessionIdSchema,
  type CreateFocusSessionInput,
} from "./focus-session.schemas";

import { getActualFocusMinutes } from "./focus-session-clock";

const staleSessionMessage = "Session state changed. Please refresh.";

export async function createFocusSessionAction(
  input: CreateFocusSessionInput,
): Promise<ActionResult> {
  const parsed = createFocusSessionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid focus session data.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { supabase, user } = await requireUser();
    const { taskId, plannedMinutes } = parsed.data;

    const { error } = await supabase.from("focus_sessions").insert({
      user_id: user.id,
      task_id: taskId || null,
      planned_minutes: plannedMinutes,
      actual_focus_minutes: 0,
      status: "ongoing",
      started_at: new Date().toISOString(),
    });

    if (error) {
      return {
        success: false,
        message: error.code === "23505"
          ? "You already have an active focus session."
          : `Failed to start focus session: ${error.message}`,
      };
    }

    return {
      success: true,
      message: "Focus session started.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while starting focus session.",
    };
  }
}

export async function pauseFocusSessionAction(
  sessionId: string,
): Promise<ActionResult> {
  const parsed = sessionIdSchema.safeParse({ sessionId });

  if (!parsed.success) {
    return { success: false, message: "Invalid session id." };
  }

  try {
    const { supabase, user } = await requireUser();

    const { data: updated, error } = await supabase
      .from("focus_sessions")
      .update({
        status: "paused",
        paused_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.sessionId)
      .eq("user_id", user.id)
      .eq("status", "ongoing")
      .select("id")
      .maybeSingle();

    if (error) {
      return {
        success: false,
        message: `Failed to pause session: ${error.message}`,
      };
    }

    if (!updated) return { success: false, message: staleSessionMessage };

    return {
      success: true,
      message: "Focus session paused.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while pausing focus session.",
    };
  }
}

export async function resumeFocusSessionAction(
  sessionId: string,
): Promise<ActionResult> {
  const parsed = sessionIdSchema.safeParse({ sessionId });

  if (!parsed.success) {
    return { success: false, message: "Invalid session id." };
  }

  try {
    const { supabase, user } = await requireUser();

    const { data: session, error: fetchError } = await supabase
      .from("focus_sessions")
      .select("id, paused_at, total_paused_seconds, status")
      .eq("id", parsed.data.sessionId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !session) {
      return {
        success: false,
        message: "Focus session not found.",
      };
    }

    if (session.status !== "paused" || !session.paused_at) {
      return {
        success: false,
        message: "Only paused sessions can be resumed.",
      };
    }

    const pausedAtMs = new Date(session.paused_at).getTime();
    const newlyPausedSeconds = Math.max(
      0,
      Math.floor((Date.now() - pausedAtMs) / 1000),
    );

    let updateQuery = supabase
      .from("focus_sessions")
      .update({
        status: "ongoing",
        paused_at: null,
        total_paused_seconds:
          session.total_paused_seconds + newlyPausedSeconds,
      })
      .eq("id", parsed.data.sessionId)
      .eq("user_id", user.id)
      .eq("status", session.status)
      .eq("total_paused_seconds", session.total_paused_seconds);

    updateQuery =
      session.paused_at === null
        ? updateQuery.is("paused_at", null)
        : updateQuery.eq("paused_at", session.paused_at);
    const { data: updated, error: updateError } = await updateQuery
      .select("id")
      .maybeSingle();

    if (updateError) {
      return {
        success: false,
        message: `Failed to resume session: ${updateError.message}`,
      };
    }

    if (!updated) return { success: false, message: staleSessionMessage };

    return {
      success: true,
      message: "Focus session resumed.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while resuming focus session.",
    };
  }
}

export async function completeFocusSessionAction(
  sessionId: string,
): Promise<ActionResult> {
  const parsed = sessionIdSchema.safeParse({ sessionId });

  if (!parsed.success) {
    return { success: false, message: "Invalid session id." };
  }

  try {
    const { supabase, user } = await requireUser();

    const { data: session, error: fetchError } = await supabase
      .from("focus_sessions")
      .select(
        "id, started_at, planned_minutes, paused_at, total_paused_seconds, status",
      )
      .eq("id", parsed.data.sessionId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !session) {
      return {
        success: false,
        message: "Focus session not found.",
      };
    }

    if (session.status !== "ongoing") {
      return {
        success: false,
        message: "Only ongoing sessions can be completed.",
      };
    }

    const endedAt = new Date();
    const actualFocusMinutes = getActualFocusMinutes(session, endedAt);

    let updateQuery = supabase
      .from("focus_sessions")
      .update({
        status: "completed",
        ended_at: endedAt.toISOString(),
        actual_focus_minutes: actualFocusMinutes,
      })
      .eq("id", parsed.data.sessionId)
      .eq("user_id", user.id)
      .eq("status", session.status)
      .eq("total_paused_seconds", session.total_paused_seconds);

    updateQuery =
      session.paused_at === null
        ? updateQuery.is("paused_at", null)
        : updateQuery.eq("paused_at", session.paused_at);
    const { data: updated, error: updateError } = await updateQuery
      .select("id")
      .maybeSingle();

    if (updateError) {
      return {
        success: false,
        message: `Failed to complete session: ${updateError.message}`,
      };
    }

    if (!updated) return { success: false, message: staleSessionMessage };

    scheduleEngagementRecalculation({
      userId: user.id,
      source: "focus-completion",
      activity: {
        type: "focus_session",
        id: parsed.data.sessionId,
      },
    });

    return {
      success: true,
      message: "Focus session completed.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while completing focus session.",
    };
  }
}

export async function cancelFocusSessionAction(
  sessionId: string,
): Promise<ActionResult> {
  const parsed = sessionIdSchema.safeParse({ sessionId });

  if (!parsed.success) {
    return { success: false, message: "Invalid session id." };
  }

  try {
    const { supabase, user } = await requireUser();

    const { data: session, error: fetchError } = await supabase
      .from("focus_sessions")
      .select(
        "id, started_at, planned_minutes, paused_at, total_paused_seconds, status",
      )
      .eq("id", parsed.data.sessionId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !session) {
      return {
        success: false,
        message: "Focus session not found.",
      };
    }

    if (session.status !== "ongoing" && session.status !== "paused") {
      return {
        success: false,
        message: "Only active sessions can be cancelled.",
      };
    }

    const endedAt = new Date();
    const actualFocusMinutes = getActualFocusMinutes(session, endedAt);

    let updateQuery = supabase
      .from("focus_sessions")
      .update({
        status: "cancelled",
        paused_at: null,
        total_paused_seconds:
          session.total_paused_seconds +
          (session.status === "paused" && session.paused_at
            ? Math.max(
                0,
                Math.floor(
                  (endedAt.getTime() - new Date(session.paused_at).getTime()) / 1000,
                ),
              )
            : 0),
        ended_at: endedAt.toISOString(),
        actual_focus_minutes: actualFocusMinutes,
      })
      .eq("id", parsed.data.sessionId)
      .eq("user_id", user.id)
      .eq("status", session.status)
      .eq("total_paused_seconds", session.total_paused_seconds);

    updateQuery =
      session.paused_at === null
        ? updateQuery.is("paused_at", null)
        : updateQuery.eq("paused_at", session.paused_at);
    const { data: updated, error: updateError } = await updateQuery
      .select("id")
      .maybeSingle();

    if (updateError) {
      return {
        success: false,
        message: `Failed to cancel session: ${updateError.message}`,
      };
    }

    if (!updated) return { success: false, message: staleSessionMessage };

    return {
      success: true,
      message: "Focus session cancelled.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while cancelling focus session.",
    };
  }
}
