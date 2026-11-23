import { describe, expect, it } from "vitest";
import { getWorkspaceTimelinePeriod, projectWorkspaceTimelineTask } from "./workspace-timeline";
import type { WorkspaceTimelineTask } from "./workspace.types";

const now = "2030-03-03T18:00:00Z";
const task: WorkspaceTimelineTask = { id: "task", title: "Task", status: "todo", due_at: null, due_date: null, schedule: [] };

describe("workspace timeline", () => {
  it("starts on the local Monday and uses an exclusive end instant across DST", () => {
    const period = getWorkspaceTimelinePeriod("2030-03-07", now, "America/New_York");
    expect(period).toMatchObject({
      start: "2030-03-04",
      end: "2030-03-31",
      previous: "2030-02-04",
      next: "2030-04-01",
      today: "2030-03-03",
      fromInstant: "2030-03-04T05:00:00Z",
      untilInstant: "2030-04-01T04:00:00Z",
    });
    expect(period.days).toHaveLength(28);
  });

  it("falls back to the current local week for invalid dates and to UTC for invalid timezones", () => {
    expect(getWorkspaceTimelinePeriod("2030-02-30", now, "Asia/Bangkok").start).toBe("2030-03-04");
    expect(getWorkspaceTimelinePeriod(undefined, now, "bad-zone")).toMatchObject({ timezone: "UTC", start: "2030-02-25" });
  });

  it("clips study plans and plots the actual deadline rather than its legacy date", () => {
    const period = getWorkspaceTimelinePeriod("2030-03-04", now, "Asia/Bangkok");
    const row = projectWorkspaceTimelineTask({
      ...task,
      due_at: "2030-03-03T17:00:00Z",
      due_date: "2030-03-10",
      schedule: [{ starts_on: "2030-02-26", ends_on: "2030-04-05", status: "active" }],
    }, period, new Date(now));
    expect(row.schedule).toMatchObject({ from: 0, to: 27 });
    expect(row.due).toEqual({ date: "2030-03-04", offset: 0 });
    expect(row.status).toBe("overdue");
  });

  it("includes legacy date-only deadlines but excludes markers at the next period boundary", () => {
    const period = getWorkspaceTimelinePeriod("2030-03-04", now, "UTC");
    const project = (changes: Partial<WorkspaceTimelineTask>) => projectWorkspaceTimelineTask({ ...task, ...changes }, period, new Date(now));
    expect(project({ due_date: "2030-03-31" }).due).toEqual({ date: "2030-03-31", offset: 27 });
    expect(project({ due_at: "2030-04-01T00:00:00Z", due_date: "2030-03-31" }).due).toBeNull();
    expect(project({ schedule: [{ starts_on: "2030-04-01", ends_on: "2030-04-02", status: "active" }] }).schedule).toBeNull();
  });
});
