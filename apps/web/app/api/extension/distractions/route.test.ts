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
  } = {},
) {
  // Ownership, session state and idempotency are checked inside the RPC.
  const unavailable = options.parent === false || options.segment === false;

  return {
    rpc: vi.fn().mockResolvedValue({
      data: unavailable
        ? null
        : {
            saved: true,
            duplicate: options.existing === true,
            id: options.existing ? "record-id" : "new-record",
          },
      error: unavailable ? { code: "P0001" } : null,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FOCUS_V2_ENABLED", "true");
  vi.stubEnv("EXTENSION_DISTRACTION_WRITE_ENABLED", "true");

  mocks.authenticate.mockResolvedValue({
    userId,
    supabase: database(),
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("Extension distraction integration API", () => {
  it.each(["FOCUS_V2_ENABLED", "EXTENSION_DISTRACTION_WRITE_ENABLED"])(
    "rejects requests when %s is disabled",
    async (flag) => {
      vi.stubEnv(flag, "false");

      const response = await POST(post(input));

      expect(response.status).toBe(503);
      expect(mocks.authenticate).not.toHaveBeenCalled();
    },
  );

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

  it("calls the authenticated client's RPC without a client-supplied identity", async () => {
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

    expect(mocks.authenticate).toHaveBeenCalledOnce();
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith(
      "extension_confirm_distraction",
      {
        p_event_id: eventId,
        p_session_id: sessionId,
        p_segment_id: segmentId,
        p_category: input.distractionType,
        p_duration_seconds: input.durationSeconds,
      },
    );
  });

  it("returns the RPC's duplicate confirmation", async () => {
    const db = database({ existing: true });

    mocks.authenticate.mockResolvedValue({
      userId,
      supabase: db,
    });

    const response = await POST(post(input));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.duplicate).toBe(true);
    expect(result.id).toBe("record-id");
    expect(db.rpc).toHaveBeenCalledOnce();
  });

  it("rejects a session that is not accessible", async () => {
    const db = database({ parent: false });

    mocks.authenticate.mockResolvedValue({
      userId,
      supabase: db,
    });

    const response = await POST(post(input));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Event or Focus state changed" });
  });

  it("rejects a changed focus segment", async () => {
    const db = database({ segment: false });

    mocks.authenticate.mockResolvedValue({
      userId,
      supabase: db,
    });

    const response = await POST(post(input));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Event or Focus state changed" });
  });

  it.each([
    ["22023", 400],
    ["42501", 403],
    ["XX000", 503],
  ])("maps RPC error %s to HTTP %i", async (code, status) => {
    const db = database();
    db.rpc.mockResolvedValue({ data: null, error: { code } });
    mocks.authenticate.mockResolvedValue({ userId, supabase: db });

    const response = await POST(post(input));

    expect(response.status).toBe(status);
  });

  it("rejects an invalid RPC response", async () => {
    const db = database();
    db.rpc.mockResolvedValue({ data: { saved: true }, error: null });
    mocks.authenticate.mockResolvedValue({ userId, supabase: db });

    const response = await POST(post(input));

    expect(response.status).toBe(502);
  });

  it("handles an unavailable RPC", async () => {
    const db = database();
    db.rpc.mockRejectedValue(new Error("Connection unavailable"));
    mocks.authenticate.mockResolvedValue({ userId, supabase: db });

    const response = await POST(post(input));

    expect(response.status).toBe(503);
  });
});
