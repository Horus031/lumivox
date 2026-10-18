import type { FocusV2Projection, FocusV2Segment, FocusV2Snapshot } from "./focus-v2.types";

function time(value: string | null): number | null {
  if (!value) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function calculateFocusV2ElapsedSeconds(
  segment: FocusV2Segment,
  atMilliseconds: number,
): number {
  const start = time(segment.started_at);
  if (start === null || segment.status === "pending") return 0;
  if (["completed", "interrupted", "skipped"].includes(segment.status)) {
    return Math.min(segment.planned_seconds, Math.max(0, segment.actual_seconds));
  }
  const end = segment.status === "paused" ? time(segment.paused_at) : atMilliseconds;
  if (end === null) return 0;
  const elapsed = Math.floor(Math.max(0, end - start) / 1000) - segment.total_paused_seconds;
  return Math.min(segment.planned_seconds, Math.max(0, elapsed));
}

export function projectFocusV2Timer(
  snapshot: FocusV2Snapshot,
  nowMilliseconds: number = Date.now(),
): FocusV2Projection {
  const segments = [...snapshot.segments].sort((a, b) => a.position - b.position);
  const live = segments.filter((segment) => segment.status === "running" || segment.status === "paused");
  const next = segments.find((segment) => segment.status === "pending") ?? null;
  const current = live[0] ?? null;
  const terminal = snapshot.session.status;
  const phase: FocusV2Projection["phase"] =
    terminal === "completed" ? "completed" :
    terminal === "cancelled" ? "cancelled" :
    live.length > 1 ? "invalid" :
    current?.status === "paused" ? "paused" :
    current?.status === "running" ? "running" :
    terminal === "ongoing" && next ? "awaiting_next" : "invalid";
  const elapsedSeconds = current ? calculateFocusV2ElapsedSeconds(current, nowMilliseconds) : 0;
  const remainingSeconds = current ? Math.max(0, current.planned_seconds - elapsedSeconds) : 0;
  return {
    phase, current, next, elapsedSeconds, remainingSeconds,
    progressPercent: current ? Math.min(100, Math.max(0, elapsedSeconds * 100 / current.planned_seconds)) : 0,
    isDue: phase === "running" && remainingSeconds === 0,
  };
}

export function shouldAutoCompleteFocusV2(
  projection: FocusV2Projection,
  pageVisible: boolean,
  online: boolean,
): boolean {
  return pageVisible && online && projection.isDue && projection.current !== null;
}
