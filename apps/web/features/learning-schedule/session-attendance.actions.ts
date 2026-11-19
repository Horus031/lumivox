"use server";

import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";

const attendanceSchema = z.discriminatedUnion("command", [
  z
    .object({
      command: z.literal("start"),
      sessionId: z.string().uuid(),
      expectedUpdatedAt: z.string().datetime({ offset: true }),
      eventKey: z.string().uuid(),
    })
    .strict(),

  z
    .object({
      command: z.literal("complete"),
      sessionId: z.string().uuid(),
      expectedUpdatedAt: z.string().datetime({ offset: true }),
      eventKey: z.string().uuid(),
    })
    .strict(),

  z
    .object({
      command: z.literal("recover"),
      sessionId: z.string().uuid(),
      expectedUpdatedAt: z.string().datetime({ offset: true }),
      eventKey: z.string().uuid(),
    })
    .strict(),

  z
    .object({
      command: z.literal("skip"),
      sessionId: z.string().uuid(),
      expectedUpdatedAt: z.string().datetime({ offset: true }),
      eventKey: z.string().uuid(),
      reason: z.string().max(500).nullable().optional(),
    })
    .strict(),
]);

export type AttendanceCommand = z.infer<typeof attendanceSchema>;

export type AttendanceActionResult =
  | {
      success: true;
      sessionId: string;
    }
  | {
      success: false;
      code:
        | "invalidInput"
        | "notAuthorized"
        | "conflict"
        | "notEligible"
        | "uncertain"
        | "saveFailed";
      message: string;
      conflict?: boolean;
      uncertain?: boolean;
    };

const RPC_TIMEOUT_MS = 8000;

function normalizeSkipReason(reason: string | null | undefined): string | null {
  const normalized = reason?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function classifyRpcError(error: { code?: string | null }): AttendanceActionResult {
  switch (error.code) {
    case "PT409":
      return {
        success: false,
        code: "conflict",
        conflict: true,
        message: "This study session changed. Reload to see its latest state.",
      };

    case "42501":
      return {
        success: false,
        code: "notAuthorized",
        message: "You do not have permission to modify this study session.",
      };

    case "22023":
      return {
        success: false,
        code: "notEligible",
        message:
          "This attendance action is not allowed for the current session state or time window.",
      };

    default:
      return {
        success: false,
        code: "saveFailed",
        message: "Could not update attendance. Please reload and try again.",
      };
  }
}

function uncertainResult(): AttendanceActionResult {
  return {
    success: false,
    code: "uncertain",
    uncertain: true,
    message:
      "The result could not be confirmed. Check the latest session before deciding whether to retry the exact same command.",
  };
}

/**
 * User-scoped Attendance mutation.
 *
 * The PostgreSQL RPC remains the authority for:
 * - ownership;
 * - parent Task / Schedule eligibility;
 * - state transitions;
 * - cutoff time;
 * - optimistic concurrency;
 * - idempotency;
 * - atomic audit.
 *
 * Never accept userId, now, sourceStatus or completedAt
 * from the client as trusted command arguments.
 */
export async function mutateStudySessionAttendanceAction(
  raw: unknown,
): Promise<AttendanceActionResult> {
  const parsed = attendanceSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      success: false,
      code: "invalidInput",
      message: "Invalid attendance request.",
    };
  }

  const input = parsed.data;

  // Normalize before dispatch so a retry preserves
  // exactly the semantic payload fingerprint expected
  // by the Skip RPC.
  const reason = input.command === "skip" ? normalizeSkipReason(input.reason) : null;

  let dispatched = false;

  try {
    const { supabase } = await requireUser();

    const args = {
      p_session_id: input.sessionId,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_event_key: input.eventKey,
    };

    const rpcName = {
      start: "ls_start_study_session",
      complete: "ls_complete_study_session",
      skip: "ls_skip_study_session",
      recover: "ls_recover_study_session",
    } as const;

    const rpcArgs = input.command === "skip" ? { ...args, p_reason: reason } : args;

    dispatched = true;

    const { data, error } = await supabase
      .rpc(rpcName[input.command], rpcArgs)
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));

    if (error) {
      // Network errors and request aborts have an
      // unknown outcome: the DB transaction might
      // already have committed.
      if (!error.code) {
        return uncertainResult();
      }

      return classifyRpcError(error);
    }

    if (data !== input.sessionId) {
      // Do not claim success on an unexpected response.
      // The RPC may have committed already.
      return uncertainResult();
    }

    return {
      success: true,
      sessionId: input.sessionId,
    };
  } catch {
    return dispatched
      ? uncertainResult()
      : {
          success: false,
          code: "notAuthorized",
          message: "You must be signed in to update attendance.",
        };
  }
}
