export type AnalyticsObligation = {
  id: string;
  scheduleId: string;
  logicalOccurrenceKey: string;
  localDate: string;
  timezone: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status:
    | "scheduled"
    | "in_progress"
    | "completed"
    | "missed"
    | "skipped"
    | "cancelled";
  completedAt: string | null;

  // Derived by the trusted query layer from a persisted
  // cancellation audit event. NOT from the client.
  cancelledAt: string | null;
};

export type AttendanceSummary = {
  eligibleDue: number;
  completedDue: number;
  onTimeDue: number;
  eligiblePlanned: number;
  completedPlanned: number;
  attendanceRate: number | null;
  onTimeRate: number | null;
  plannedCoverage: number | null;
};

const GRACE_MS = 60 * 60 * 1000;

function instant(value: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new Error("Invalid attendance instant");
  }
  return ms;
}

function percent(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : (numerator / denominator) * 100;
}

function isProactivelyCancelled(row: AnalyticsObligation): boolean {
  if (row.status !== "cancelled") return false;

  // Never silently guess cancellation eligibility:
  // the caller must supply the authoritative audit time.
  if (row.cancelledAt === null) {
    throw new Error(`Missing cancellation audit for ${row.id}`);
  }

  return instant(row.cancelledAt) < instant(row.scheduledStartAt);
}

/**
 * Coalesce versions/replacements of one logical obligation.
 *
 * Proactively cancelled historical replacements are
 * excluded before counting. If more than one eligible
 * candidate remains, the projection is ambiguous:
 * fail instead of silently double-counting.
 */
export function uniqueEligibleObligations(
  rows: readonly AnalyticsObligation[],
): AnalyticsObligation[] {
  const groups = new Map<string, AnalyticsObligation[]>();

  for (const row of rows) {
    const key = JSON.stringify([row.scheduleId, row.logicalOccurrenceKey]);

    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const result: AnalyticsObligation[] = [];

  for (const [key, group] of groups) {
    const eligible = group.filter((row) => !isProactivelyCancelled(row));

    if (eligible.length > 1) {
      throw new Error(`Ambiguous logical obligation: ${key}`);
    }

    if (eligible.length === 1) {
      result.push(eligible[0]);
    }
  }

  return result;
}

/**
 * A current-state projection evaluated at an explicit
 * caller-supplied asOf instant (the read adapter uses application-server time).
 *
 * Historical as-of snapshots would require event replay;
 * this function does not pretend to reconstruct them.
 */
export function calculateAttendanceSummary(
  rows: readonly AnalyticsObligation[],
  asOf: string,
): AttendanceSummary {
  const now = instant(asOf);
  const obligations = uniqueEligibleObligations(rows);

  let eligibleDue = 0;
  let completedDue = 0;
  let onTimeDue = 0;
  let completedPlanned = 0;

  for (const row of obligations) {
    const end = instant(row.scheduledEndAt);
    const start = instant(row.scheduledStartAt);
    if (end <= start) {
      throw new Error("Invalid session interval");
    }

    const completed =
      row.status === "completed" &&
      row.completedAt !== null &&
      instant(row.completedAt) <= now;

    if (completed) {
      completedPlanned += 1;
    }

    // Due is based on actual UTC elapsed grace,
    // not the Missed Sweep's persisted status.
    if (end + GRACE_MS > now) {
      continue;
    }

    eligibleDue += 1;

    if (completed) {
      completedDue += 1;

      if (instant(row.completedAt!) <= end) {
        onTimeDue += 1;
      }
    }
  }

  return {
    eligibleDue,
    completedDue,
    onTimeDue,
    eligiblePlanned: obligations.length,
    completedPlanned,
    attendanceRate: percent(completedDue, eligibleDue),
    onTimeRate: percent(onTimeDue, eligibleDue),
    plannedCoverage: percent(completedPlanned, obligations.length),
  };
}
