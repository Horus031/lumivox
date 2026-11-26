import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { askRagQuestionAction } from "./rag-chat.actions";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ user: { id: "user-id" } }),
}));
vi.mock("@/lib/redis/rate-limit", () => ({
  checkRateLimit: async () => ({ success: true }),
  formatRateLimitMessage: vi.fn(),
}));

const payload = {
  question: "Explain binary search",
  clientRequestId: "request-id",
};

describe("RAG ask error contract", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AI_API_BASE_URL", "https://ai.example.test");
    vi.stubEnv("AI_INTERNAL_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    [409, "RAG_TURN_IN_PROGRESS", true],
    [503, "RAG_TURN_OUTCOME_UNKNOWN", true],
    [409, "RAG_PREVIOUS_TURN_FAILED", false],
    [409, "RAG_IDEMPOTENCY_CONFLICT", false],
    [403, "RAG_DOCUMENT_ACCESS_DENIED", false],
  ])("preserves FastAPI code from HTTP %i (%s)", async (status, code, retrySameRequest) => {
    fetchMock.mockResolvedValue(Response.json({ detail: code }, { status }));

    await expect(askRagQuestionAction(payload)).resolves.toMatchObject({
      success: false,
      code,
      retrySameRequest,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the session and allows a fresh request after confirmed generation failure", async () => {
    fetchMock.mockResolvedValue(Response.json({
      detail: { code: "RAG_GENERATION_FAILED", session_id: "chat-session" },
    }, { status: 502 }));

    await expect(askRagQuestionAction(payload)).resolves.toMatchObject({
      success: false,
      code: "RAG_GENERATION_FAILED",
      retrySameRequest: false,
      sessionId: "chat-session",
    });
  });

  it.each([
    [new DOMException("Aborted", "AbortError"), "AI_API_TIMEOUT"],
    [new TypeError("Fetch failed"), "AI_API_UNAVAILABLE"],
  ])("treats a transport failure (%s) as an uncertain outcome", async (error, code) => {
    fetchMock.mockRejectedValue(error);

    await expect(askRagQuestionAction(payload)).resolves.toMatchObject({
      success: false,
      code,
      retrySameRequest: true,
    });
  });
});
