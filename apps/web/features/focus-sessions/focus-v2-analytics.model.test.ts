import { describe, expect, it } from "vitest";
import {
  buildFocusV2AnalyticsReport, getUtcAnalyticsWindow,
  type FocusAnalyticsInputs,
} from "./focus-v2-analytics.model";

const startUtc = "2026-10-01T00:00:00.000Z";
const base: FocusAnalyticsInputs = {
  startUtc, days: 7, truncated: false, taskNames: { t1: "Linear Algebra" },
  sessions: [
    { id: "v2", task_id: "t1", session_mode: "pomodoro", status: "completed",
      planned_minutes: 10, actual_focus_minutes: 10, total_paused_seconds: 30,
      started_at: "2026-10-02T12:00:00Z" },
    { id: "old", task_id: null, session_mode: "legacy", status: "cancelled",
      planned_minutes: 30, actual_focus_minutes: 12, total_paused_seconds: 15,
      started_at: "2026-10-03T12:00:00Z" },
  ],
  segments: [
    { session_id: "v2", segment_kind: "focus", status: "completed", actual_seconds: 300, total_paused_seconds: 20 },
    { session_id: "v2", segment_kind: "short_break", status: "skipped", actual_seconds: 25, total_paused_seconds: 0 },
    { session_id: "v2", segment_kind: "focus", status: "completed", actual_seconds: 300, total_paused_seconds: 10 },
  ],
  distractions: [{ session_id: "v2", distraction_type: "social_media", duration_seconds: 180 }],
  rewards: [{ id: "reward1", token_delta: 10 }],
  engagement: { current_streak_days: 3, longest_streak_days: 6, token_balance: 40, completed_focus_sessions_total: 20 },
};

describe("Focus V2 analytics: read-only aggregation", () => {
  it("counts focus, breaks, pause and legacy minutes independently", () => {
    const result = buildFocusV2AnalyticsReport(base);
    expect(result.focusSeconds).toBe(600 + 720);
    expect(result.breakSeconds).toBe(25);
    expect(result.pausedSeconds).toBe(45);
    expect(result.completedRounds).toBe(2);
    expect(result.pomodoroSessions).toBe(1);
    expect(result.completionRatePercent).toBe(50);
  });
  it("does not automatically deduct manually declared distractions from verified focus", () => {
    const result = buildFocusV2AnalyticsReport(base);
    expect(result.distractionsCount).toBe(1);
    expect(result.distractionSeconds).toBe(180);
    expect(result.focusSeconds).toBe(1320);
  });
  it("excludes pending/running focus and never uses planned duration as actual", () => {
    const input = { ...base, segments: [...base.segments, {
      session_id: "v2", segment_kind: "focus", status: "running", actual_seconds: 0, total_paused_seconds: 0,
    }] };
    expect(buildFocusV2AnalyticsReport(input).focusSeconds).toBe(1320);
  });
  it("deduplicates session and reward identifiers", () => {
    const input = { ...base, sessions: [...base.sessions, base.sessions[0]], rewards: [...base.rewards, base.rewards[0]] };
    const result = buildFocusV2AnalyticsReport(input);
    expect(result.completedSessions).toBe(1);
    expect(result.rewardsCount).toBe(1);
    expect(result.rewardTokens).toBe(10);
  });
  it("keeps active sessions out of the completed-versus-cancelled denominator", () => {
    const input = { ...base, sessions: [...base.sessions, {
      ...base.sessions[0], id: "active", status: "paused", actual_focus_minutes: 0,
    }] };
    const result = buildFocusV2AnalyticsReport(input);
    expect(result.activeSessions).toBe(1);
    expect(result.completionRatePercent).toBe(50);
  });
  it("builds daily rows in UTC and allocates a session to its start day", () => {
    const result = buildFocusV2AnalyticsReport(base);
    expect(result.daily).toHaveLength(7);
    expect(result.daily[1]).toMatchObject({ date: "2026-10-02", focusSeconds: 600, completedSessions: 1 });
    expect(result.daily[2]).toMatchObject({ date: "2026-10-03", focusSeconds: 720, completedSessions: 0 });
  });
  it("filters data beyond the window and preserves truncation evidence", () => {
    const input = { ...base, truncated: true, sessions: [...base.sessions, {
      ...base.sessions[0], id: "out", started_at: "2026-10-09T10:00:00Z",
    }] };
    const result = buildFocusV2AnalyticsReport(input);
    expect(result.sessionCount).toBe(2);
    expect(result.truncated).toBe(true);
  });
  it("handles empty dataset and missing engagement without inventing rewards", () => {
    const result = buildFocusV2AnalyticsReport({ ...base, sessions: [], segments: [], distractions: [], rewards: [], engagement: null });
    expect(result.focusSeconds).toBe(0);
    expect(result.completionRatePercent).toBe(0);
    expect(result.tasks).toHaveLength(0);
    expect(result.engagement).toBeNull();
  });
  it("constructs calendar day windows independently of DST/local timezone", () => {
    expect(getUtcAnalyticsWindow(new Date("2026-10-19T13:20:00Z"), 7)).toEqual({
      startUtc: "2026-10-13T00:00:00.000Z",
      endUtcExclusive: "2026-10-20T00:00:00.000Z",
      days: 7,
    });
  });
});
