import type { FocusV2Projection } from "./focus-v2.types";

export type FocusV2Cue = "focus_end" | "break_start" | "focus_start" | "session_complete" | "distraction";

export type FocusV2AudioPhase = {
  phase: FocusV2Projection["phase"];
  segmentId: string | null;
  segmentKind: string | null;
};

export function toFocusV2AudioPhase(projection: FocusV2Projection): FocusV2AudioPhase {
  return {
    phase: projection.phase,
    segmentId: projection.current?.id ?? null,
    segmentKind: projection.current?.segment_kind ?? null,
  };
}

// Called only on changes from an already-observed snapshot. Initial load is silent.
export function getFocusV2TransitionCue(
  previous: FocusV2AudioPhase,
  next: FocusV2AudioPhase,
): FocusV2Cue | null {
  if (previous.phase === "completed" || previous.phase === "cancelled") return null;
  if (next.phase === "completed") return "session_complete";
  if (next.phase === "cancelled" || next.phase === "invalid") return null;
  if (previous.segmentId === next.segmentId && previous.phase === next.phase) return null;
  if (next.phase === "paused") return null;
  if (next.phase === "awaiting_next" && previous.phase === "running" && previous.segmentKind === "focus") {
    return "focus_end";
  }
  if (next.phase === "running" && next.segmentId !== previous.segmentId) {
    return next.segmentKind === "focus" ? "focus_start" : "break_start";
  }
  if (next.phase === "running" && previous.phase === "awaiting_next") {
    return next.segmentKind === "focus" ? "focus_start" : "break_start";
  }
  return null;
}
