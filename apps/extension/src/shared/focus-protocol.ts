import { PROTOCOL_CHANNEL, PROTOCOL_VERSION } from "./protocol";

export type FocusAction =
  | "pause"
  | "resume"
  | "complete"
  | "skip_break"
  | "start_next";

export type FocusRequest =
  | {
      channel: typeof PROTOCOL_CHANNEL;
      version: typeof PROTOCOL_VERSION;
      type: "FOCUS_GET";
    }
  | {
      channel: typeof PROTOCOL_CHANNEL;
      version: typeof PROTOCOL_VERSION;
      type: "FOCUS_TRANSITION";
      sessionId: string;
      expectedSegmentId: string;
      action: FocusAction;
    };

export type FocusWireSegment = {
  id: string;
  position: number;
  round_number: number;
  segment_kind: "focus" | "short_break" | "long_break";
  status:
    | "pending"
    | "running"
    | "paused"
    | "completed"
    | "skipped"
    | "interrupted";
  planned_seconds: number;
  actual_seconds: number;
  started_at: string | null;
  paused_at: string | null;
  total_paused_seconds: number;
};

export type FocusWireSnapshot = {
  session: {
    id: string;
    status: string;
  };
  plan: {
    roundCount: number;
  };
  segments: FocusWireSegment[];
  serverTime: string;
};

export type FocusResultState =
  | "active"
  | "idle"
  | "unauthorized"
  | "conflict"
  | "unavailable";

export type FocusResponse = {
  channel: typeof PROTOCOL_CHANNEL;
  version: typeof PROTOCOL_VERSION;
  type: "FOCUS_RESULT";
  state: FocusResultState;
  snapshot?: FocusWireSnapshot | null;
  message?: string;
};

function record(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function uuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v,
    )
  );
}

const actions: readonly string[] = [
  "pause",
  "resume",
  "complete",
  "skip_break",
  "start_next",
];

export function isFocusRequest(v: unknown): v is FocusRequest {
  if (
    !record(v) ||
    v.channel !== PROTOCOL_CHANNEL ||
    v.version !== PROTOCOL_VERSION
  )
    return false;

  if (v.type === "FOCUS_GET") return true;

  return (
    v.type === "FOCUS_TRANSITION" &&
    uuid(v.sessionId) &&
    uuid(v.expectedSegmentId) &&
    typeof v.action === "string" &&
    actions.includes(v.action)
  );
}

function validSegment(v: unknown): v is FocusWireSegment {
  if (!record(v)) return false;

  return (
    uuid(v.id) &&
    Number.isInteger(v.position) &&
    Number.isInteger(v.round_number) &&
    ["focus", "short_break", "long_break"].includes(String(v.segment_kind)) &&
    [
      "pending",
      "running",
      "paused",
      "completed",
      "skipped",
      "interrupted",
    ].includes(String(v.status)) &&
    typeof v.planned_seconds === "number" &&
    Number.isInteger(v.planned_seconds) &&
    v.planned_seconds > 0 &&
    typeof v.actual_seconds === "number" &&
    Number.isFinite(v.actual_seconds) &&
    typeof v.total_paused_seconds === "number" &&
    Number.isFinite(v.total_paused_seconds) &&
    (v.started_at === null || typeof v.started_at === "string") &&
    (v.paused_at === null || typeof v.paused_at === "string")
  );
}

export function isFocusSnapshot(v: unknown): v is FocusWireSnapshot {
  if (!record(v) || !record(v.session) || !record(v.plan)) return false;

  return (
    uuid(v.session.id) &&
    typeof v.session.status === "string" &&
    Number.isInteger(v.plan.roundCount) &&
    Array.isArray(v.segments) &&
    v.segments.length > 0 &&
    v.segments.every(validSegment) &&
    typeof v.serverTime === "string" &&
    Number.isFinite(Date.parse(v.serverTime))
  );
}

export function focusResult(
  state: FocusResultState,
  snapshot?: FocusWireSnapshot | null,
  message?: string,
): FocusResponse {
  return {
    channel: PROTOCOL_CHANNEL,
    version: PROTOCOL_VERSION,
    type: "FOCUS_RESULT",
    state,
    ...(snapshot !== undefined ? { snapshot } : {}),
    ...(message ? { message } : {}),
  };
}

export function isFocusResponse(v: unknown): v is FocusResponse {
  if (
    !record(v) ||
    v.channel !== PROTOCOL_CHANNEL ||
    v.version !== PROTOCOL_VERSION ||
    v.type !== "FOCUS_RESULT"
  )
    return false;

  if (
    !["active", "idle", "unauthorized", "conflict", "unavailable"].includes(
      String(v.state),
    )
  ) {
    return false;
  }

  if (v.message !== undefined && typeof v.message !== "string") return false;

  if (v.state === "active") {
    return isFocusSnapshot(v.snapshot);
  }

  return (
    v.snapshot === undefined ||
    v.snapshot === null ||
    isFocusSnapshot(v.snapshot)
  );
}
