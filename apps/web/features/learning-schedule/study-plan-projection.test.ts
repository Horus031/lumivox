import { describe, expect, it } from "vitest";
import {
  calendarMonth,
  getTodaysStudySessions,
  groupStudyCalendar,
  todayInTimezone,
  type StudyPlanSession,
} from "./study-plan-projection";
const asOf = "2026-11-03T01:00:00Z";
const fixture = (overrides: Partial<StudyPlanSession> = {}): StudyPlanSession => ({
  id: "s",
  taskId: "t",
  taskTitle: "Study",
  scheduleId: "sch",
  localDate: "2026-11-03",
  localStartTime: "19:00",
  localEndTime: "20:00",
  timezone: "Asia/Tokyo",
  scheduledStartAt: "2026-11-03T10:00:00Z",
  status: "scheduled",
  ...overrides,
});
describe("Study Plan projection", () => {
  it("UT-032 uses each session's own day with normalized fixtures", () => {
    const tokyo = fixture({ id: "tokyo" }),
      ny = fixture({
        id: "ny",
        localDate: "2026-11-02",
        timezone: "America/New_York",
        scheduledStartAt: "2026-11-03T00:00:00Z",
      });
    expect(getTodaysStudySessions([tokyo, ny], asOf).map((r) => r.id)).toEqual(["ny", "tokyo"]);
    expect(groupStudyCalendar([tokyo, ny], "2026-11").map((d) => d.localDate)).toEqual([
      "2026-11-02",
      "2026-11-03",
    ]);
  });
  it("does not use UTC/device day as a global filter", () => {
    expect(todayInTimezone(asOf, "Asia/Tokyo")).toBe("2026-11-03");
    expect(todayInTimezone(asOf, "America/New_York")).toBe("2026-11-02");
  });
  it("excludes Cancelled from Today but preserves calendar history, Completed and Skipped", () => {
    const rows = (
      ["scheduled", "in_progress", "completed", "missed", "skipped", "cancelled"] as const
    ).map((status, i) => fixture({ id: String(i), status }));
    expect(getTodaysStudySessions(rows, asOf)).toHaveLength(5);
    expect(groupStudyCalendar(rows, "2026-11")[0].sessions).toHaveLength(6);
  });
  it.each(["2026-13", "2026-00", "2026-1", "26-01", "2026-11-01", "invalid"])(
    "rejects invalid month %s",
    (m) => expect(() => groupStudyCalendar([], m)).toThrow(),
  );
  it("returns empty views and excludes other dates", () => {
    expect(groupStudyCalendar([fixture()], "2026-10")).toEqual([]);
    expect(getTodaysStudySessions([], asOf)).toEqual([]);
    expect(getTodaysStudySessions([fixture({ localDate: "2026-11-04" })], asOf)).toEqual([]);
  });
  it("handles year rollover and different days across the date line", () => {
    expect(todayInTimezone("2026-12-31T16:00:00Z", "Asia/Tokyo")).toBe("2027-01-01");
    expect(todayInTimezone("2026-12-31T16:00:00Z", "America/New_York")).toBe("2026-12-31");
    expect(calendarMonth("2026-12").add({ months: 1 }).toString()).toBe("2027-01");
    expect(calendarMonth("2027-01").subtract({ months: 1 }).toString()).toBe("2026-12");
  });
  it("handles spring gap day", () => {
    for (const time of ["2026-03-08T06:59:59Z", "2026-03-08T07:00:00Z"])
      expect(todayInTimezone(time, "America/New_York")).toBe("2026-03-08");
  });
  it("orders both fall fold instants by elapsed instant", () => {
    const a = fixture({
      id: "a",
      localDate: "2026-11-01",
      timezone: "America/New_York",
      scheduledStartAt: "2026-11-01T01:30:00-04:00",
    });
    const b = { ...a, id: "b", scheduledStartAt: "2026-11-01T01:30:00-05:00" };
    expect(getTodaysStudySessions([b, a], "2026-11-01T06:00:00Z").map((r) => r.id)).toEqual([
      "a",
      "b",
    ]);
  });
  it("uses ID tie break across Tasks without mutating input", () => {
    const rows = [fixture({ id: "z", taskId: "z" }), fixture({ id: "a", taskId: "a" })];
    expect(groupStudyCalendar(rows, "2026-11")[0].sessions.map((r) => r.id)).toEqual(["a", "z"]);
    expect(rows[0].id).toBe("z");
  });
  it("rejects bad zone, instant and stored calendar date", () => {
    expect(() => todayInTimezone(asOf, "Not/AZone")).toThrow();
    expect(() => todayInTimezone("bad", "UTC")).toThrow();
    expect(() => groupStudyCalendar([fixture({ localDate: "2026-11-99" })], "2026-11")).toThrow();
  });
});
