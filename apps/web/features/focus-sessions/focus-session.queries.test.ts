import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mock.requireUser }));

import { getActiveFocusSession } from "./focus-session.queries";

beforeEach(() => vi.clearAllMocks());

describe("legacy active focus session lookup", () => {
  it("explicitly excludes Pomodoro parents even in drain/off mode", async () => {
    const eq = vi.fn();
    const inStatuses = vi.fn();
    const query = {
      select: vi.fn(), eq, in: inStatuses,
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    query.select.mockReturnValue(query);
    eq.mockReturnValue(query);
    inStatuses.mockReturnValue(query);
    const from = vi.fn().mockReturnValue(query);
    mock.requireUser.mockResolvedValue({ supabase: { from } });

    await expect(getActiveFocusSession()).resolves.toBeNull();
    expect(from).toHaveBeenCalledWith("focus_sessions");
    expect(eq).toHaveBeenCalledWith("session_mode", "legacy");
    expect(inStatuses).toHaveBeenCalledWith("status", ["ongoing", "paused"]);
  });
});
