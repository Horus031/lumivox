import { NextResponse } from "next/server";
import { z } from "zod";
import { AiApiError, fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import { authenticateExtension } from "@/lib/extension/authenticate";
import { scheduleEngagementRecalculation } from "@/features/engagement-retention/engagement-retention.background";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = {
  "Cache-Control": "no-store",
  Vary: "Authorization",
};

const transitionSchema = z
  .object({
    sessionId: z.uuid(),
    expectedSegmentId: z.uuid(),
    action: z.enum(["pause", "resume", "complete", "skip_break", "start_next"]),
  })
  .strict();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

type ExtensionIdentity = NonNullable<
  Awaited<ReturnType<typeof authenticateExtension>>
>;

async function getSnapshot(identity: ExtensionIdentity) {
  const { supabase, userId } = identity;

  const { data: parent, error: parentError } = await supabase
    .from("focus_sessions")
    .select("id, user_id, status, session_mode")
    .eq("user_id", userId)
    .eq("session_mode", "pomodoro")
    .in("status", ["ongoing", "paused"])
    .maybeSingle();

  if (parentError) throw parentError;
  if (!parent) return null;

  const [planResult, segmentsResult] = await Promise.all([
    supabase
      .from("focus_session_plans")
      .select("round_count")
      .eq("session_id", parent.id)
      .single(),
    supabase
      .from("focus_session_segments")
      .select(
        "id, position, round_number, segment_kind, status, " +
          "planned_seconds, actual_seconds, started_at, " +
          "paused_at, total_paused_seconds",
      )
      .eq("session_id", parent.id)
      .order("position", { ascending: true }),
  ]);

  if (
    planResult.error ||
    segmentsResult.error ||
    !planResult.data ||
    !segmentsResult.data?.length
  ) {
    throw new Error("Incomplete Pomodoro snapshot");
  }

  return {
    session: {
      id: parent.id,
      status: parent.status,
    },
    plan: {
      roundCount: planResult.data.round_count,
    },
    segments: segmentsResult.data,
    serverTime: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  if (process.env.FOCUS_V2_ENABLED !== "true") {
    return json({ error: "Focus V2 runtime disabled" }, 503);
  }

  try {
    const identity = await authenticateExtension(request);
    if (!identity) return json({ error: "Unauthorized" }, 401);

    return json({ snapshot: await getSnapshot(identity) });
  } catch {
    return json({ error: "Focus service unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  if (process.env.FOCUS_V2_ENABLED !== "true") {
    return json({ error: "Focus V2 runtime disabled" }, 503);
  }

  try {
    const identity = await authenticateExtension(request);
    if (!identity) return json({ error: "Unauthorized" }, 401);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const parsed = transitionSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: "Invalid transition request" }, 400);
    }

    const { sessionId, expectedSegmentId, action } = parsed.data;
    const { supabase, userId } = identity;

    // RLS + explicit ownership. Do not reveal foreign sessions.
    const { data: parent, error } = await supabase
      .from("focus_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .eq("session_mode", "pomodoro")
      .in("status", ["ongoing", "paused"])
      .maybeSingle();

    if (error) {
      return json({ error: "Could not verify session" }, 503);
    }
    if (!parent) {
      return json({ error: "Active session not found" }, 404);
    }

    const result = await fetchAiApi<{
      parentStatus: string;
      parentCompleted: boolean;
    }>({
      path: "/api/v1/focus-v2/transition",
      body: {
        user_id: userId,
        session_id: sessionId,
        action,
        expected_segment_id: expectedSegmentId,
      },
      retries: 0,
    });

    if (
      typeof result.parentCompleted !== "boolean" ||
      typeof result.parentStatus !== "string"
    ) {
      return json({ error: "Invalid backend response" }, 502);
    }

    if (result.parentCompleted && result.parentStatus === "completed") {
      scheduleEngagementRecalculation({
        userId,
        source: "focus-completion",
        activity: {
          type: "focus_session",
          id: sessionId,
        },
      });
    }

    return json({
      snapshot: await getSnapshot(identity),
    });
  } catch (error) {
    if (error instanceof AiApiError) {
      return json(
        {
          error:
            error.status === 409
              ? "Session changed; refresh required"
              : "Transition rejected",
        },
        error.status === 409 ? 409 : 400,
      );
    }

    return json({ error: "Transition unavailable" }, 503);
  }
}
