import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateExtension } from "@/lib/extension/authenticate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    eventId: z.uuid(),
    sessionId: z.uuid(),
    segmentId: z.uuid(),
    distractionType: z.enum(["social_media", "messaging"]),
    durationSeconds: z.number().int().min(30).max(900),
  })
  .strict();

type Input = z.infer<typeof schema>;

const responseHeaders = {
  "Cache-Control": "no-store",
  Vary: "Authorization",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: responseHeaders,
  });
}

type Identity = NonNullable<Awaited<ReturnType<typeof authenticateExtension>>>;

async function findExisting(identity: Identity, eventId: string) {
  return identity.supabase
    .from("distraction_events")
    .select(
      "id,session_id,extension_segment_id,distraction_type,duration_seconds",
    )
    .eq("user_id", identity.userId)
    .eq("extension_event_id", eventId)
    .maybeSingle();
}

function matchesExisting(
  existing: {
    session_id: string;
    extension_segment_id: string | null;
    distraction_type: string;
    duration_seconds: number;
  },
  input: Input,
): boolean {
  return (
    existing.session_id === input.sessionId &&
    existing.extension_segment_id === input.segmentId &&
    existing.distraction_type === input.distractionType &&
    existing.duration_seconds === input.durationSeconds
  );
}

async function resolveDuplicate(identity: Identity, input: Input) {
  const { data, error } = await findExisting(identity, input.eventId);

  if (error) {
    return json({ error: "Database unavailable" }, 503);
  }

  if (!data) {
    return json({ error: "Retry required" }, 503);
  }

  if (!matchesExisting(data, input)) {
    return json({ error: "Event ID already used for different data" }, 409);
  }

  return json({
    saved: true,
    duplicate: true,
    id: data.id,
  });
}

export async function POST(request: Request) {
  if (process.env.FOCUS_V2_ENABLED !== "true") {
    return json({ error: "Focus V2 disabled" }, 503);
  }

  try {
    const identity = await authenticateExtension(request);

    if (!identity) {
      return json({ error: "Unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return json({ error: "Invalid distraction" }, 400);
    }

    const input = parsed.data;
    const { supabase, userId } = identity;

    // Resolve an already-committed retry before checking
    // whether the original focus segment is still active.
    const existing = await findExisting(identity, input.eventId);

    if (existing.error) {
      return json({ error: "Database unavailable" }, 503);
    }

    if (existing.data) {
      return resolveDuplicate(identity, input);
    }

    // Ownership and active parent are independently verified.
    const { data: parent, error: parentError } = await supabase
      .from("focus_sessions")
      .select("id")
      .eq("id", input.sessionId)
      .eq("user_id", userId)
      .eq("session_mode", "pomodoro")
      .eq("status", "ongoing")
      .maybeSingle();

    if (parentError) {
      return json({ error: "Session unavailable" }, 503);
    }

    if (!parent) {
      return json({ error: "Active session not found" }, 409);
    }

    // The candidate must belong to the current running
    // focus round, never a break or pending segment.
    const { data: segment, error: segmentError } = await supabase
      .from("focus_session_segments")
      .select("id")
      .eq("id", input.segmentId)
      .eq("session_id", input.sessionId)
      .eq("segment_kind", "focus")
      .eq("status", "running")
      .maybeSingle();

    if (segmentError) {
      return json({ error: "Segment unavailable" }, 503);
    }

    if (!segment) {
      return json({ error: "Focus round changed" }, 409);
    }

    const { data: inserted, error: insertError } = await supabase
      .from("distraction_events")
      .insert({
        user_id: userId,
        session_id: input.sessionId,
        extension_event_id: input.eventId,
        extension_segment_id: input.segmentId,
        distraction_type: input.distractionType,
        duration_seconds: input.durationSeconds,
        note: null,
      })
      .select("id")
      .single();

    // Two simultaneous requests can both see "not found".
    // PostgreSQL's unique index resolves that race.
    if (insertError?.code === "23505") {
      return resolveDuplicate(identity, input);
    }

    if (insertError || !inserted) {
      return json({ error: "Unable to save distraction" }, 503);
    }

    return json({
      saved: true,
      duplicate: false,
      id: inserted.id,
    });
  } catch {
    return json({ error: "Distraction service unavailable" }, 503);
  }
}
