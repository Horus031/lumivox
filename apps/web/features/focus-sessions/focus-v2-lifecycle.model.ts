import type { FocusV2Projection, FocusV2Snapshot } from "./focus-v2.types";

export type FocusV2LifecycleStats = {
  roundCount: number;
  currentRound: number;
  completedRounds: number;
  completedBreaks: number;
  plannedFocusSeconds: number;
  plannedBreakSeconds: number;
  recordedFocusSeconds: number;
  recordedBreakSeconds: number;
  displayedFocusSeconds: number;
  displayedBreakSeconds: number;
};

export function getFocusV2LifecycleStats(
  snapshot: FocusV2Snapshot,
  projection: FocusV2Projection,
): FocusV2LifecycleStats {
  const focusSegments = snapshot.segments.filter((segment) => segment.segment_kind === "focus");
  const breakSegments = snapshot.segments.filter((segment) => segment.segment_kind !== "focus");
  const recordedFocusSeconds = focusSegments.reduce((total, segment) => total + segment.actual_seconds, 0);
  const recordedBreakSeconds = breakSegments.reduce((total, segment) => total + segment.actual_seconds, 0);
  const liveSegment = projection.current;
  // Use the same clock-corrected projection as the visible timer.
  const liveElapsed = liveSegment ? projection.elapsedSeconds : 0;
  const isLiveFocus = liveSegment?.segment_kind === "focus";
  const isLiveBreak = !!liveSegment && !isLiveFocus;
  const lastStarted = [...snapshot.segments].reverse().find((segment) => segment.started_at !== null);
  const currentRound = projection.current?.round_number
    ?? projection.next?.round_number
    ?? lastStarted?.round_number
    ?? 1;

  return {
    roundCount: snapshot.plan.round_count,
    currentRound: Math.min(snapshot.plan.round_count, currentRound),
    completedRounds: focusSegments.filter((segment) => segment.status === "completed").length,
    completedBreaks: breakSegments.filter((segment) => segment.status === "completed").length,
    plannedFocusSeconds: focusSegments.reduce((total, segment) => total + segment.planned_seconds, 0),
    plannedBreakSeconds: breakSegments.reduce((total, segment) => total + segment.planned_seconds, 0),
    recordedFocusSeconds,
    recordedBreakSeconds,
    displayedFocusSeconds: recordedFocusSeconds + (isLiveFocus ? liveElapsed : 0),
    displayedBreakSeconds: recordedBreakSeconds + (isLiveBreak ? liveElapsed : 0),
  };
}

export function formatFocusV2Clock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
