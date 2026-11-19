import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
import { getStudyFocusAttributionsAction, linkStudyFocusAction } from "./focus-attribution.actions";
const study = "9a400000-0000-4000-8000-000000000001",
  focus = "9a500000-0000-4000-8000-000000000001",
  id = "9a600000-0000-4000-8000-000000000001";
let rpc: ReturnType<typeof vi.fn>,
  abort: ReturnType<typeof vi.fn>,
  from: ReturnType<typeof vi.fn>,
  session: Record<string, ReturnType<typeof vi.fn>>,
  links: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  vi.clearAllMocks();
  abort = vi.fn().mockResolvedValue({ data: id, error: null });
  rpc = vi.fn(() => ({ abortSignal: abort }));
  session = {
    select: vi.fn(),
    eq: vi.fn(),
    abortSignal: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: study }, error: null }),
  };
  links = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    abortSignal: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  for (const [key, fn] of Object.entries(session))
    if (key !== "maybeSingle") fn.mockReturnValue(session);
  for (const [key, fn] of Object.entries(links))
    if (key !== "abortSignal") fn.mockReturnValue(links);
  from = vi.fn((table: string) => (table === "task_study_sessions" ? session : links));
  mocks.auth.mockResolvedValue({ user: { id: "owner-a" }, supabase: { rpc, from } });
});
describe("9A attribution Server Actions", () => {
  it("passes only the pair IDs to the authenticated RPC", async () => {
    expect(await linkStudyFocusAction({ studySessionId: study, focusSessionId: focus })).toEqual({
      success: true,
      attributionId: id,
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("ls_link_study_focus", {
      p_study_session_id: study,
      p_focus_session_id: focus,
    });
  });
  it.each([
    { studySessionId: study, focusSessionId: focus, userId: "spoof" },
    { studySessionId: study, focusSessionId: "bad" },
    {},
  ])("rejects invalid/caller-owned identity %j", async (raw) => {
    expect(await linkStudyFocusAction(raw)).toEqual({ success: false, code: "invalidInput" });
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("unauthenticated requests do not access DB", async () => {
    mocks.auth.mockRejectedValue(new Error("auth"));
    expect(await linkStudyFocusAction({ studySessionId: study, focusSessionId: focus })).toEqual({
      success: false,
      code: "notAuthorized",
    });
    expect(await getStudyFocusAttributionsAction({ studySessionId: study })).toEqual({
      success: false,
      code: "notAuthorized",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
  it.each([
    ["23505", "conflict"],
    ["55P03", "conflictRetryable"],
    ["42501", "notAuthorized"],
    ["22023", "invalidInput"],
    ["P0001", "saveFailed"],
    ["", "uncertain"],
  ])("maps SQLSTATE %s without private diagnostics", async (code, expected) => {
    abort.mockResolvedValue({ data: null, error: { code, message: "private Focus data" } });
    expect(await linkStudyFocusAction({ studySessionId: study, focusSessionId: focus })).toEqual({
      success: false,
      code: expected,
    });
  });
  it("transport exception is uncertain; never creates another Focus", async () => {
    abort.mockRejectedValue(new Error("timeout"));
    expect(await linkStudyFocusAction({ studySessionId: study, focusSessionId: focus })).toEqual({
      success: false,
      code: "uncertain",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });
  it("read is scoped to both owning session and attribution owner", async () => {
    expect(await getStudyFocusAttributionsAction({ studySessionId: study })).toEqual({
      success: true,
      attributions: [],
      hasMore: false,
    });
    expect(session.eq).toHaveBeenCalledWith("user_id", "owner-a");
    expect(session.eq).toHaveBeenCalledWith("id", study);
    expect(links.eq).toHaveBeenCalledWith("user_id", "owner-a");
    expect(links.eq).toHaveBeenCalledWith("study_session_id", study);
    expect(links.limit).toHaveBeenCalledWith(201);
  });
  it("missing/cross-owner study does not read history", async () => {
    session.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getStudyFocusAttributionsAction({ studySessionId: study })).toEqual({
      success: false,
      code: "notFound",
    });
    expect(from).toHaveBeenCalledTimes(1);
  });
  it("read errors never manufacture an empty success", async () => {
    links.abortSignal.mockResolvedValue({ data: null, error: { message: "private" } });
    expect(await getStudyFocusAttributionsAction({ studySessionId: study })).toEqual({
      success: false,
      code: "loadFailed",
    });
  });
  it("bounded read signals additional history instead of silently truncating", async () => {
    links.abortSignal.mockResolvedValue({
      data: Array.from({ length: 201 }, () => ({ id })),
      error: null,
    });
    const result = await getStudyFocusAttributionsAction({ studySessionId: study });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.hasMore).toBe(true);
      expect(result.attributions).toHaveLength(200);
    }
  });
});
