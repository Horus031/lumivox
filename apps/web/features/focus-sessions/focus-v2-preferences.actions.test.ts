import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FOCUS_V2_PREFERENCES } from "./focus-v2-preferences";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));

import { saveFocusV2PreferencesAction } from "./focus-v2-preferences.actions";

const userId = "11111111-1111-4111-8111-111111111111";
let upsert: ReturnType<typeof vi.fn>;
let from: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FOCUS_V2_ENABLED", "true");
  upsert = vi.fn().mockResolvedValue({ error: null });
  from = vi.fn(() => ({ upsert }));
  mocks.requireUser.mockResolvedValue({ user: { id: userId }, supabase: { from } });
});

afterEach(() => vi.unstubAllEnvs());

describe("saveFocusV2PreferencesAction", () => {
  it("only persists settings for the authenticated user", async () => {
    const response = await saveFocusV2PreferencesAction(DEFAULT_FOCUS_V2_PREFERENCES);
    expect(response.success).toBe(true);
    expect(from).toHaveBeenCalledWith("focus_user_preferences");
    expect(upsert).toHaveBeenCalledExactlyOnceWith({
      user_id: userId,
      focus_minutes: 25,
      short_break_minutes: 5,
      long_break_minutes: 15,
      round_count: 4,
      long_break_every: 4,
      auto_start_breaks: false,
      auto_start_focus: false,
    }, { onConflict: "user_id" });
  });

  it("does not persist settings while the flag is disabled", async () => {
    vi.stubEnv("FOCUS_V2_ENABLED", "false");
    expect((await saveFocusV2PreferencesAction(DEFAULT_FOCUS_V2_PREFERENCES)).success).toBe(false);
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });

  it("rejects invalid numeric values and unexpected keys before auth", async () => {
    expect((await saveFocusV2PreferencesAction({
      ...DEFAULT_FOCUS_V2_PREFERENCES, roundCount: 0,
    })).success).toBe(false);
    expect((await saveFocusV2PreferencesAction({
      ...DEFAULT_FOCUS_V2_PREFERENCES, user_id: "victim",
    } as typeof DEFAULT_FOCUS_V2_PREFERENCES)).success).toBe(false);
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });

  it("does not claim success when Supabase reports an error", async () => {
    upsert.mockResolvedValue({ error: { message: "RLS" } });
    expect((await saveFocusV2PreferencesAction(DEFAULT_FOCUS_V2_PREFERENCES)).success).toBe(false);
  });

  it("contains authentication and connection failures", async () => {
    mocks.requireUser.mockRejectedValue(new Error("Auth"));
    expect((await saveFocusV2PreferencesAction(DEFAULT_FOCUS_V2_PREFERENCES)).success).toBe(false);
  });
});
