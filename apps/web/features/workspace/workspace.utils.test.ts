import { describe, expect, it } from "vitest";

import {
  resolveWorkspaceScope,
} from "./workspace.utils";

describe("resolveWorkspaceScope", () => {
  const goalIds = ["goal-a", "goal-b"];

  it("defaults to all", () => {
    expect(resolveWorkspaceScope(undefined, goalIds)).toEqual({
      type: "all",
    });
  });

  it("supports unassigned tasks", () => {
    expect(resolveWorkspaceScope("unassigned", goalIds)).toEqual({
      type: "unassigned",
    });
  });

  it("uses an owned goal", () => {
    expect(resolveWorkspaceScope("goal-a", goalIds)).toEqual({
      type: "goal",
      goalId: "goal-a",
    });
  });

  it("rejects unknown goals", () => {
    expect(resolveWorkspaceScope("unknown", goalIds)).toEqual({
      type: "all",
    });
  });
});
