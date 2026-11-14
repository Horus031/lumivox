import { describe, expect, it } from "vitest";
import { calculateAttendanceSummary, type AnalyticsObligation } from "./attendance-analytics";

const asOf = "2026-11-02T12:00:00Z";

function session(index: number, overrides: Partial<AnalyticsObligation> = {}): AnalyticsObligation {
  return {
    id: `session-${index}`,
    scheduleId: "schedule-1",
    logicalOccurrenceKey: `occurrence-${index}`,
    localDate: "2026-11-01",
    timezone: "Asia/Ho_Chi_Minh",
    scheduledStartAt: "2026-11-01T08:00:00Z",
    scheduledEndAt: "2026-11-01T09:00:00Z",
    status: "missed",
    completedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

describe("Attendance analytics", () => {
  it("UT-027 returns N/A for zero due sessions", () => {
    const result = calculateAttendanceSummary(
      [
        session(1, {
          scheduledStartAt: "2026-11-03T08:00:00Z",
          scheduledEndAt: "2026-11-03T09:00:00Z",
        }),
      ],
      asOf,
    );

    expect(result.eligibleDue).toBe(0);
    expect(result.attendanceRate).toBeNull();
    expect(result.onTimeRate).toBeNull();
    expect(result.plannedCoverage).toBe(0);
  });

  it("UT-028 calculates 8 of 12 due", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      session(
        i,
        i < 8
          ? {
              status: "completed",
              completedAt: i < 5 ? "2026-11-01T08:45:00Z" : "2026-11-01T09:30:00Z",
            }
          : {},
      ),
    );

    const result = calculateAttendanceSummary(rows, asOf);

    expect(result.eligibleDue).toBe(12);
    expect(result.completedDue).toBe(8);
    expect(result.onTimeDue).toBe(5);
    expect(result.attendanceRate).toBeCloseTo(66.6667, 3);
    expect(result.onTimeRate).toBeCloseTo(41.6667, 3);
  });

  it("UT-030 does not count future obligations as due", () => {
    const rows = [
      session(1),
      session(2, {
        status: "scheduled",
        scheduledStartAt: "2026-11-04T08:00:00Z",
        scheduledEndAt: "2026-11-04T09:00:00Z",
      }),
    ];

    const result = calculateAttendanceSummary(rows, asOf);

    expect(result.eligibleDue).toBe(1);
    expect(result.eligiblePlanned).toBe(2);
  });

  it("UT-031 excludes proactive cancellation", () => {
    const rows = [
      session(1, {
        status: "cancelled",
        cancelledAt: "2026-10-31T08:00:00Z",
      }),
      session(2),
    ];

    const result = calculateAttendanceSummary(rows, asOf);

    expect(result.eligibleDue).toBe(1);
    expect(result.eligiblePlanned).toBe(1);
  });

  it("does not invent an audit time", () => {
    expect(() => calculateAttendanceSummary([session(1, { status: "cancelled" })], asOf)).toThrow(
      /Missing cancellation audit/,
    );
  });

  it("does not double-count proactive replacements", () => {
    const rows = [
      session(1, {
        status: "cancelled",
        cancelledAt: "2026-10-31T08:00:00Z",
      }),
      session(2, {
        logicalOccurrenceKey: "occurrence-1",
        status: "completed",
        completedAt: "2026-11-01T08:45:00Z",
      }),
    ];

    const result = calculateAttendanceSummary(rows, asOf);

    expect(result.eligibleDue).toBe(1);
    expect(result.completedDue).toBe(1);
  });

  it("UT-029 counts late completion but not on-time", () => {
    const result = calculateAttendanceSummary(
      [
        session(1, {
          status: "completed",
          completedAt: "2026-11-01T09:30:00Z",
        }),
      ],
      asOf,
    );

    expect(result.completedDue).toBe(1);
    expect(result.onTimeDue).toBe(0);
    expect(result.attendanceRate).toBe(100);
    expect(result.onTimeRate).toBe(0);
  });

  it("counts grace equality as due", () => {
    const result = calculateAttendanceSummary([session(1)], "2026-11-01T10:00:00Z");

    expect(result.eligibleDue).toBe(1);
  });

  it("does not credit completion after asOf", () => {
    const result = calculateAttendanceSummary(
      [
        session(1, {
          status: "completed",
          completedAt: "2026-11-03T12:00:00Z",
        }),
      ],
      asOf,
    );

    expect(result.eligibleDue).toBe(1);
    expect(result.completedDue).toBe(0);
    expect(result.completedPlanned).toBe(0);
  });

  it("keeps a cancellation after start eligible", () => {
    const result = calculateAttendanceSummary(
      [
        session(1, {
          status: "cancelled",
          cancelledAt: "2026-11-01T08:30:00Z",
        }),
      ],
      asOf,
    );

    expect(result.eligibleDue).toBe(1);
    expect(result.completedDue).toBe(0);
  });

  it("rejects ambiguous active obligation identity", () => {
    expect(() =>
      calculateAttendanceSummary(
        [
          session(1),
          session(2, {
            logicalOccurrenceKey: "occurrence-1",
          }),
        ],
        asOf,
      ),
    ).toThrow(/Ambiguous logical obligation/);
  });

  it("does not infer Missed from a persisted Scheduled status", () => {
    const result = calculateAttendanceSummary([session(1, { status: "scheduled" })], asOf);

    expect(result.eligibleDue).toBe(1);
    expect(result.completedDue).toBe(0);
  });
});
