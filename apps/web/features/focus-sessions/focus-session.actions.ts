"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";

import {
  createFocusSessionSchema,
  sessionIdSchema,
  type CreateFocusSessionInput,
} from "./focus-session.schemas";

function calculateElapsedFocusMinutes(
  startedAt: string,
  endedAt: Date,
  totalPausedSeconds: number
) {
  const startedMs = new Date(startedAt).getTime();
  const endedMs = endedAt.getTime();

  const rawElapsedSeconds = Math.max(
    0,
    Math.floor((endedMs - startedMs) / 1000)
  );

  const activeSeconds = Math.max(
    0,
    rawElapsedSeconds - totalPausedSeconds
  );

  return Math.floor(activeSeconds / 60);
}

export async function createFocusSessionAction(
  input: CreateFocusSessionInput
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
        message: `Failed to start focus session: ${error.message}`,
      };
    }

    revalidatePath("/focus");

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
  sessionId: string
): Promise<ActionResult> {
  const parsed = sessionIdSchema.safeParse({ sessionId });

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid session id.",
    };
  }

  try {
    const { supabase } = await requireUser();

    const { error } = await supabase
      .from("focus_sessions")
      .update({
        status: "paused",
        paused_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.sessionId)
      .eq("status", "ongoing");

    if (error) {
      return {
        success: false,
        message: `Failed to pause session: ${error.message}`,
      };
    }

    revalidatePath("/focus");

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
  sessionId: string
): Promise<ActionResult> {
  const parsed = sessionIdSchema.safeParse({ sessionId });

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid session id.",
    };
  }

  try {
    const { supabase } = await requireUser();

    const { data: session, error: fetchError } = await supabase
      .from("focus_sessions")
      .select("id, paused_at, total_paused_seconds, status")
      .eq("id", parsed.data.sessionId)
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
    const nowMs = Date.now();

    const newlyPausedSeconds = Math.max(
      0,
      Math.floor((nowMs - pausedAtMs) / 1000)
    );

    const updatedTotalPausedSeconds =
      session.total_paused_seconds + newlyPausedSeconds;

    const { error: updateError } = await supabase
      .from("focus_sessions")
      .update({
        status: "ongoing",
        paused_at: null,
        total_paused_seconds: updatedTotalPausedSeconds,
      })
      .eq("id", parsed.data.sessionId);

    if (updateError) {
      return {
        success: false,
        message: `Failed to resume session: ${updateError.message}`,
      };
    }

    revalidatePath("/focus");

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
  sessionId: string
): Promise<ActionResult> {
  const parsed = sessionIdSchema.safeParse({ sessionId });

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid session id.",
    };
  }

  try {
    const { supabase } = await requireUser();

    const { data: session, error: fetchError } = await supabase
      .from("focus_sessions")
      .select(
        "id, started_at, total_paused_seconds, status"
      )
      .eq("id", parsed.data.sessionId)
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

    const actualFocusMinutes = calculateElapsedFocusMinutes(
      session.started_at,
      endedAt,
      session.total_paused_seconds
    );

    const { error: updateError } = await supabase
      .from("focus_sessions")
      .update({
        status: "completed",
        ended_at: endedAt.toISOString(),
        actual_focus_minutes: actualFocusMinutes,
      })
      .eq("id", parsed.data.sessionId);

    if (updateError) {
      return {
        success: false,
        message: `Failed to complete session: ${updateError.message}`,
      };
    }

    revalidatePath("/focus");
    revalidatePath("/dashboard");

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
  sessionId: string
): Promise<ActionResult> {
  const parsed = sessionIdSchema.safeParse({ sessionId });

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid session id.",
    };
  }

  try {
    const { supabase } = await requireUser();

    const { data: session, error: fetchError } = await supabase
      .from("focus_sessions")
      .select("id, started_at, total_paused_seconds, status")
      .eq("id", parsed.data.sessionId)
      .single();

    if (fetchError || !session) {
      return {
        success: false,
        message: "Focus session not found.",
      };
    }

    const endedAt = new Date();

    const actualFocusMinutes = calculateElapsedFocusMinutes(
      session.started_at,
      endedAt,
      session.total_paused_seconds
    );

    const { error: updateError } = await supabase
      .from("focus_sessions")
      .update({
        status: "cancelled",
        ended_at: endedAt.toISOString(),
        actual_focus_minutes: actualFocusMinutes,
      })
      .eq("id", parsed.data.sessionId);

    if (updateError) {
      return {
        success: false,
        message: `Failed to cancel session: ${updateError.message}`,
      };
    }

    revalidatePath("/focus");

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