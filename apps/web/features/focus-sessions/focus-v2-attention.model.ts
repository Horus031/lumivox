import type { FocusV2Projection } from "./focus-v2.types";

export type FocusV2ObservedPhase = {
  phase: FocusV2Projection["phase"];
  segmentId: string | null;
  segmentKind: NonNullable<FocusV2Projection["current"]>["segment_kind"] | null;
};

export type FocusV2NotificationKind =
  | "focusStarted" | "breakStarted" | "focusFinished"
  | "breakFinished" | "sessionCompleted";

export function observeFocusV2Phase(projection: FocusV2Projection): FocusV2ObservedPhase {
  return {
    phase: projection.phase,
    segmentId: projection.current?.id ?? null,
    segmentKind: projection.current?.segment_kind ?? null,
  };
}

// Call on an OBSERVED server snapshot transition, not every second.
// Initial page load is deliberately silent.
export function classifyFocusV2Notification(
  previous: FocusV2ObservedPhase,
  next: FocusV2ObservedPhase,
): FocusV2NotificationKind | null {
  if (previous.phase === "completed" || previous.phase === "cancelled") return null;
  if (next.phase === "completed") return "sessionCompleted";
  if (next.phase === "cancelled" || next.phase === "invalid") return null;
  if (next.phase === "awaiting_next" && previous.phase === "running") {
    return previous.segmentKind === "focus" ? "focusFinished" : "breakFinished";
  }
  if (next.phase === "running" && next.segmentId !== previous.segmentId) {
    return next.segmentKind === "focus" ? "focusStarted" : "breakStarted";
  }
  if (next.phase === "running" && previous.phase === "awaiting_next") {
    return next.segmentKind === "focus" ? "focusStarted" : "breakStarted";
  }
  return null;
}

export function canObserveFocusV2PageAway(projection: FocusV2Projection): boolean {
  return projection.phase === "running" && projection.current?.segment_kind === "focus";
}

export type FocusV2AwayCandidate = {
  segmentId: string;
  durationSeconds: number;
};

// Absence is NOT a distraction. This only suggests a manual entry for the user.
export function getFocusV2AwayCandidate(
  hiddenAtMs: number,
  returnedAtMs: number,
  segmentId: string,
  sameRunningFocusSegment: boolean,
  minimumAwaySeconds: number,
): FocusV2AwayCandidate | null {
  if (!sameRunningFocusSegment || returnedAtMs <= hiddenAtMs) return null;
  const seconds = Math.min(7200, Math.floor((returnedAtMs - hiddenAtMs) / 1000));
  if (seconds < minimumAwaySeconds) return null;
  return { segmentId, durationSeconds: seconds };
}
