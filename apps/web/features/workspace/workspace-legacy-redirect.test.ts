import { describe, expect, it } from "vitest";

import { buildLegacyTaskWorkspaceUrl } from "./workspace-legacy-redirect";

describe("buildLegacyTaskWorkspaceUrl", () => {
  it("redirects the legacy task list", () => {
    expect(buildLegacyTaskWorkspaceUrl({})).toBe("/workspace");
  });

  it("preserves the selected goal", () => {
    expect(
      buildLegacyTaskWorkspaceUrl({
        goalId: "goal-1",
      }),
    ).toBe("/workspace?goal=goal-1");
  });

  it("maps task edit links", () => {
    expect(
      buildLegacyTaskWorkspaceUrl({
        taskId: "task-1",

        action: "edit",
      }),
    ).toBe("/workspace?task=task-1&tab=overview&edit=1");
  });

  it("maps create subtask links", () => {
    expect(
      buildLegacyTaskWorkspaceUrl({
        parentTaskId: "task-1",

        action: "create-subtask",
      }),
    ).toBe("/workspace?task=task-1&tab=subtasks");
  });
});
