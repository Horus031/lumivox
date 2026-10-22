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

// type Input = z.infer<typeof schema>;

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

// type Identity = NonNullable<Awaited<ReturnType<typeof authenticateExtension>>>;

// async function findExisting(identity: Identity, eventId: string) {
//   return identity.supabase
//     .from("distraction_events")
//     .select(
//       "id,session_id,extension_segment_id,distraction_type,duration_seconds",
//     )
//     .eq("user_id", identity.userId)
//     .eq("extension_event_id", eventId)
//     .maybeSingle();
// }

// function matchesExisting(
//   existing: {
//     session_id: string;
//     extension_segment_id: string | null;
//     distraction_type: string;
//     duration_seconds: number;
//   },
//   input: Input,
// ): boolean {
//   return (
//     existing.session_id === input.sessionId &&
//     existing.extension_segment_id === input.segmentId &&
//     existing.distraction_type === input.distractionType &&
//     existing.duration_seconds === input.durationSeconds
//   );
// }

// async function resolveDuplicate(identity: Identity, input: Input) {
//   const { data, error } = await findExisting(identity, input.eventId);

//   if (error) {
//     return json({ error: "Database unavailable" }, 503);
//   }

//   if (!data) {
//     return json({ error: "Retry required" }, 503);
//   }

//   if (!matchesExisting(data, input)) {
//     return json({ error: "Event ID already used for different data" }, 409);
//   }

//   return json({
//     saved: true,
//     duplicate: true,
//     id: data.id,
//   });
// }

export async function POST(request: Request) {
  if (process.env.FOCUS_V2_ENABLED !== "true") {
    return json({ error: "Focus V2 disabled" }, 503);
  }

  if (process.env.EXTENSION_DISTRACTION_WRITE_ENABLED !== "true") {
    return json(
      { error: "Extension distraction logging temporarily disabled" },
      503,
    );
  }

  let identity;

  try {
    identity = await authenticateExtension(request);
  } catch {
    return json({ error: "Authentication unavailable" }, 503);
  }

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
    return json({ error: "Invalid distraction data" }, 400);
  }

  const input = parsed.data;

  try {
    const { data, error } = await identity.supabase.rpc(
      "extension_confirm_distraction",
      {
        p_event_id: input.eventId,
        p_session_id: input.sessionId,
        p_segment_id: input.segmentId,
        p_category: input.distractionType,
        p_duration_seconds: input.durationSeconds,
      },
    );

    if (error) {
      if (error.code === "P0001") {
        return json({ error: "Event or Focus state changed" }, 409);
      }

      if (error.code === "22023") {
        return json({ error: "Invalid data" }, 400);
      }

      if (error.code === "42501") {
        return json({ error: "Forbidden" }, 403);
      }

      return json({ error: "Database unavailable" }, 503);
    }

    if (
      typeof data !== "object" ||
      data === null ||
      Array.isArray(data) ||
      data.saved !== true ||
      typeof data.duplicate !== "boolean" ||
      typeof data.id !== "string"
    ) {
      return json({ error: "Invalid RPC response" }, 502);
    }

    return json({
      saved: true,
      duplicate: data.duplicate,
      id: data.id,
    });
  } catch {
    return json({ error: "Distraction service unavailable" }, 503);
  }
}
