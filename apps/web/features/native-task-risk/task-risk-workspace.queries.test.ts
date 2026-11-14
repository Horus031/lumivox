
import { describe, expect, it, vi } from "vitest";

import { workspaceTask } from "@/features/workspace/workspace.test-fixtures";
import type { TypedSupabaseClient } from "@/types/supabase.types";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));

import { getWorkspaceTaskRiskStates } from "./task-risk-workspace.queries";

const NOW = new Date("2026-11-14T10:00:00.000Z");

function taskAt(index: number) {
  return workspaceTask({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    due_at: "2026-11-16T18:00:00.000Z",
  });
}

function mockClient(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as TypedSupabaseClient;
}

describe("Workspace Task Risk Batch Query", () => {
  it("loads 205 eligible tasks in 3 bounded RPC calls", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });

    const tasks = Array.from(
      { length: 205 },
      (_, index) => taskAt(index),
    );

    const states = await getWorkspaceTaskRiskStates(tasks, {
      now: NOW,
      supabase: mockClient(rpc),
    });

    expect(rpc).toHaveBeenCalledTimes(3);

    expect(
      rpc.mock.calls.map(
        (call) => call[1].p_task_ids.length,
      ),
    ).toEqual([100, 100, 5]);

    expect(Object.keys(states)).toHaveLength(205);

    for (const state of Object.values(states)) {
      expect(state.status).toBe("unavailable");
    }
  });

  it("does not query ineligible tasks", async () => {
    const rpc = vi.fn();

    const states = await getWorkspaceTaskRiskStates(
      [
        workspaceTask({
          id: "completed",
          status: "completed",
        }),
        workspaceTask({
          id: "no-deadline",
          due_at: null,
          due_date: null,
        }),
      ],
      {
        now: NOW,
        supabase: mockClient(rpc),
      },
    );

    expect(rpc).not.toHaveBeenCalled();
    expect(states.completed.status).toBe("ineligible");
    expect(states["no-deadline"].status).toBe("ineligible");
  });

  it("rejects database errors instead of returning fake risk", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });

    await expect(
      getWorkspaceTaskRiskStates([taskAt(0)], {
        now: NOW,
        supabase: mockClient(rpc),
      }),
    ).rejects.toThrow("Failed to load task risk snapshots");
  });
});
