type LegacyClockInput = {
  started_at: string;
  paused_at: string | null;
  total_paused_seconds: number;
  planned_minutes: number;
  status: "ongoing" | "paused" | "completed" | "cancelled";
};

export function getElapsedFocusSeconds(
  session: LegacyClockInput,
  now: Date = new Date(),
): number {
  const startMs = new Date(session.started_at).getTime();

  // An active pause freezes elapsed focus time.
  const effectiveEndMs =
    session.status === "paused" && session.paused_at
      ? new Date(session.paused_at).getTime()
      : now.getTime();

  const rawSeconds = Math.max(0, Math.floor((effectiveEndMs - startMs) / 1000));

  return Math.max(0, rawSeconds - session.total_paused_seconds);
}

export function getRemainingFocusSeconds(
  session: LegacyClockInput,
  now: Date = new Date(),
): number {
  return Math.max(
    0,
    session.planned_minutes * 60 - getElapsedFocusSeconds(session, now),
  );
}

export function getActualFocusMinutes(
  session: LegacyClockInput,
  now: Date = new Date(),
): number {
  return Math.min(
    session.planned_minutes,
    Math.floor(getElapsedFocusSeconds(session, now) / 60),
  );
}
