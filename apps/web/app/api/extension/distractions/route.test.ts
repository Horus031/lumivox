// @vitest-environment node

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
}));

vi.mock("@/lib/extension/authenticate", () => ({
  authenticateExtension: mocks.authenticate,
}));

import { POST } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const segmentId = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";

const input = {
  eventId,
  sessionId,
  segmentId,
  distractionType: "social_media",
  durationSeconds: 45,
};

function post(body: unknown): Request {
  return new Request("https://lumivox.test/api/extension/distractions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function database(
  options: {
    existing?: boolean;
    parent?: boolean;
    segment?: boolean;
    duplicateInsert?: boolean;
  } = {},
) {
  const inserts: unknown[] = [];

  const from = (tableName: string) => {
    const query: Record<string, unknown> = {};

    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);

    query.maybeSingle = vi.fn(async () => {
      if (tableName === "distraction_events") {
        return {
          data: options.existing
            ? {
                id: "record-id",
                session_id: sessionId,
                extension_segment_id: segmentId,
                distraction_type: "social_media",
                duration_seconds: 45,
              }
            : null,
          error: null,
        };
      }

      return {
        data: (
          tableName === "focus_sessions"
            ? options.parent !== false
            : options.segment !== false
        )
          ? { id: "verified-id" }
          : null,
        error: null,
      };
    });

    query.insert = vi.fn((value: unknown) => {
      inserts.push(value);
      return query;
    });

    query.single = vi.fn(async () => ({
      data: options.duplicateInsert ? null : { id: "new-record" },
      error: options.duplicateInsert ? { code: "23505" } : null,
    }));

    return query;
  };

  return { from, inserts };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FOCUS_V2_ENABLED", "true");

  mocks.authenticate.mockResolvedValue({
    userId,
    supabase: database(),
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("Extension distraction integration API", () => {
  it("rejects anonymous requests", async () => {
    mocks.authenticate.mockResolvedValue(null);

    const response = await POST(post(input));

    expect(response.status).toBe(401);
  });

  it("rejects a client-supplied user ID", async () => {
    const response = await POST(post({ ...input, userId: "another-user" }));

    expect(response.status).toBe(400);
  });

  it("rejects malformed duration", async () => {
    const response = await POST(post({ ...input, durationSeconds: 9000 }));

    expect(response.status).toBe(400);
  });

  it("saves using the authenticated identity", async () => {
    const db = database();

    mocks.authenticate.mockResolvedValue({
      userId,
      supabase: db,
    });

    const response = await POST(post(input));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.saved).toBe(true);
    expect(result.duplicate).toBe(false);

    expect(db.inserts).toContainEqual(
      expect.objectContaining({
        user_id: userId,
        session_id: sessionId,
        extension_segment_id: segmentId,
        extension_event_id: eventId,
      }),
    );
  });

  it("accepts an existing event without another insert", async () => {
    const db = database({ existing: true });

    mocks.authenticate.mockResolvedValue({
      userId,
      supabase: db,
    });

    const response = await POST(post(input));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.duplicate).toBe(true);
    expect(db.inserts).toHaveLength(0);
  });

  it("rejects a session that is not accessible", async () => {
    const db = database({ parent: false });

    mocks.authenticate.mockResolvedValue({
      userId,
      supabase: db,
    });

    const response = await POST(post(input));

    expect(response.status).toBe(409);
    expect(db.inserts).toHaveLength(0);
  });

  it("rejects a changed focus segment", async () => {
    const db = database({ segment: false });

    mocks.authenticate.mockResolvedValue({
      userId,
      supabase: db,
    });

    const response = await POST(post(input));

    expect(response.status).toBe(409);
    expect(db.inserts).toHaveLength(0);
  });
});
