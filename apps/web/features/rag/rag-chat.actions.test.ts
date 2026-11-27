import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { askRagQuestionAction } from "./rag-chat.actions";

const { admission } = vi.hoisted(() => ({ admission: vi.fn() }));
vi.mock("@/lib/redis/rag-admission", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/redis/rag-admission")>(),
  checkRagAdmission: admission,
}));
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
    admission.mockReset();
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

  it("validates explicit v2 input before invoking admission", async () => {
    vi.stubEnv("RAG_IDEMPOTENT_ADMISSION_ENABLED", "true");
    await expect(askRagQuestionAction({ ...payload, conversationProtocol: "v2" }))
      .resolves.toMatchObject({ success: false, code: "RAG_INVALID_REQUEST" });
    expect(admission).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("correlates a server action with the API without changing the logical request ID", async () => {
    vi.stubEnv("RAG_OBSERVABILITY_ENABLED", "true");
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    fetchMock.mockResolvedValue(Response.json({ answer: "Study answer" }));
    try {
      await expect(askRagQuestionAction(payload)).resolves.toMatchObject({ success: true });
      const request = fetchMock.mock.calls[0]?.[1];
      const traceId = new Headers(request?.headers).get("x-lumivox-request-id");
      expect(traceId).toMatch(/^[0-9a-f-]{36}$/);
      expect(JSON.parse(String(request?.body)).client_request_id).toBe(payload.clientRequestId);
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
        event: "rag.web.operation.finished", trace_id: traceId, success: true,
      });
      expect(log.mock.calls[0]?.[0]).not.toContain(payload.question);
    } finally {
      log.mockRestore();
    }
  });

  it("caps new v2 scopes while keeping existing authorized scopes eligible", async () => {
    vi.stubEnv("RAG_IDEMPOTENT_ADMISSION_ENABLED", "true");
    const ids = Array.from({ length: 21 }, (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`);
    const request = {
      ...payload, conversationProtocol: "v2" as const, selectedDocumentIds: ids.toReversed(),
      clientRequestId: "22222222-2222-4222-8222-222222222222",
    };
    await expect(askRagQuestionAction(request))
      .resolves.toMatchObject({ success: false, code: "RAG_INVALID_REQUEST" });
    expect(admission).not.toHaveBeenCalled();
    admission.mockResolvedValue(null);
    fetchMock.mockResolvedValue(Response.json({ answer: "Study answer" }));
    await expect(askRagQuestionAction({ ...request, sessionId: "33333333-3333-4333-8333-333333333333" }))
      .resolves.toMatchObject({ success: true });
    expect(admission).toHaveBeenCalledWith("user-id", "ask", request.clientRequestId,
      expect.objectContaining({ selectedDocumentIds: ids }));
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
