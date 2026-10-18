import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FOCUS_V2_PREFERENCES } from "./focus-v2-preferences";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
import { getFocusV2Preferences } from "./focus-v2-preferences.queries";

const userId = "11111111-1111-4111-8111-111111111111";
let query: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  query = {};
  for (const name of ["from", "select", "eq"]) query[name] = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  mocks.requireUser.mockResolvedValue({ user: { id: userId }, supabase: query });
});

describe("getFocusV2Preferences", () => {
  it("uses RLS and returns the default for first-time users", async () => {
    expect(await getFocusV2Preferences()).toEqual(DEFAULT_FOCUS_V2_PREFERENCES);
    expect(query.from).toHaveBeenCalledWith("focus_user_preferences");
    expect(query.eq).toHaveBeenCalledWith("user_id", userId);
  });

  it("converts DB snake_case data to UI preferences", async () => {
    query.maybeSingle.mockResolvedValue({
      data: {
        focus_minutes: 50,
        short_break_minutes: 10,
        long_break_minutes: 20,
        round_count: 4,
        long_break_every: 4,
        auto_start_breaks: true,
        auto_start_focus: false,
      }, error: null,
    });
    expect(await getFocusV2Preferences()).toMatchObject({
      focusMinutes: 50, shortBreakMinutes: 10, autoStartBreaks: true,
    });
  });

  it("propagates read errors rather than pretending the row is missing", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: "db offline" } });
    await expect(getFocusV2Preferences()).rejects.toThrow("Unable to load");
  });
});
