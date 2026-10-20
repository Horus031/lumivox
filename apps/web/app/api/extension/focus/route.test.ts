// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  fetchAiApi: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock("@/lib/extension/authenticate", () => ({
  authenticateExtension: mocks.authenticate,
}));

vi.mock("@/lib/ai-api/fetch-ai-api", () => ({
  fetchAiApi: mocks.fetchAiApi,
  AiApiError: class AiApiError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));

vi.mock(
  "@/features/engagement-retention/engagement-retention.background",
  () => ({
    scheduleEngagementRecalculation: mocks.schedule,
  }),
);

import { GET, POST } from "./route";

const sessionId = "11111111-1111-4111-8111-111111111111";
const segmentId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

function createDatabase(parentExists = true) {
  return {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        maybeSingle: async () => ({
          data: parentExists
            ? {
                id: sessionId,
                user_id: userId,
                status: "ongoing",
                session_mode: "pomodoro",
              }
            : null,
          error: null,
        }),
        single: async () => ({
          data: { round_count: 2 },
          error: null,
        }),
        order: async () => ({
          data: [
            {
              id: segmentId,
              position: 1,
              round_number: 1,
              segment_kind: "focus",
              status: "running",
              planned_seconds: 300,
              actual_seconds: 0,
              started_at: "2026-10-20T10:00:00Z",
              paused_at: null,
              total_paused_seconds: 0,
            },
          ],
          error: null,
        }),
      };

      if (
        ![
          "focus_sessions",
          "focus_session_plans",
          "focus_session_segments",
        ].includes(table)
      ) {
        throw new Error("Unexpected table");
      }

      return q;
    },
  };
}

function postBody(action: string) {
  return {
    sessionId,
    expectedSegmentId: segmentId,
    action,
  };
}

function makePost(body: unknown) {
  return new Request("https://lumivox.test/api/extension/focus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FOCUS_V2_ENABLED", "true");
  mocks.authenticate.mockResolvedValue({
    userId,
    supabase: createDatabase(),
  });
});

describe("Extension Focus API", () => {
  it("rejects unauthenticated reads", async () => {
    mocks.authenticate.mockResolvedValue(null);

    const response = await GET(
      new Request("https://lumivox.test/api/extension/focus"),
    );

    expect(response.status).toBe(401);
    expect(mocks.fetchAiApi).not.toHaveBeenCalled();
  });

  it("reads an active session without service-role writes", async () => {
    const response = await GET(
      new Request("https://lumivox.test/api/extension/focus"),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.snapshot.session.id).toBe(sessionId);
    expect(mocks.fetchAiApi).not.toHaveBeenCalled();
  });

  it("returns no active session without inventing one", async () => {
    mocks.authenticate.mockResolvedValue({
      userId,
      supabase: createDatabase(false),
    });

    const response = await GET(
      new Request("https://lumivox.test/api/extension/focus"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      snapshot: null,
    });
  });

  it("rejects invalid transitions before reaching FastAPI", async () => {
    const response = await POST(makePost(postBody("delete")));

    expect(response.status).toBe(400);
    expect(mocks.fetchAiApi).not.toHaveBeenCalled();
  });

  it("uses authenticated identity, not client-supplied user ID", async () => {
    mocks.fetchAiApi.mockResolvedValue({
      parentStatus: "paused",
      parentCompleted: false,
    });

    const response = await POST(
      makePost({
        ...postBody("pause"),
        userId: "another-user",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.fetchAiApi).not.toHaveBeenCalled();

    const valid = await POST(makePost(postBody("pause")));

    expect(valid.status).toBe(200);
    expect(mocks.fetchAiApi).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/v1/focus-v2/transition",
        retries: 0,
        body: {
          user_id: userId,
          session_id: sessionId,
          action: "pause",
          expected_segment_id: segmentId,
        },
      }),
    );
  });

  it("does not call FastAPI for an inaccessible session", async () => {
    mocks.authenticate.mockResolvedValue({
      userId,
      supabase: createDatabase(false),
    });

    const response = await POST(makePost(postBody("pause")));

    expect(response.status).toBe(404);
    expect(mocks.fetchAiApi).not.toHaveBeenCalled();
  });
});
