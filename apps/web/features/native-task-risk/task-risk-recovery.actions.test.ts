import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadTaskRiskRecoveryHistoryAction,
  reassessTaskRiskAfterRecoveryAction,
} from "./task-risk-recovery.actions";

const mocks = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), fetch: vi.fn(), rate: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ user: { id: "owner" }, supabase: { from: mocks.from } }),
}));
vi.mock("./task-risk-recovery.server", () => ({ recoveryWriter: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/ai-api/fetch-ai-api", () => ({ fetchAiApi: mocks.fetch }));
vi.mock("@/lib/redis/rate-limit", () => ({ checkRateLimit: mocks.rate }));

const attempt = "60000000-0000-4000-8000-000000000041";
const request = "60000000-0000-4000-8000-000000000051";
const task = "60000000-0000-4000-8000-000000000011";

function filtered(data: unknown) {
  return {
    select() { return this; },
    eq() { return this; },
    maybeSingle: async () => ({ data }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockImplementation((table) => table === "tasks"
    ? filtered({ status: "todo", completed_at: null, due_date: null, due_at: new Date(Date.now() + 86_400_000).toISOString() })
    : filtered({ task_id: task }));
});

describe("recovery reassessment", () => {
  it("fails closed for new inference when Redis is unavailable", async () => {
    mocks.rate.mockResolvedValue({ success: false });
    mocks.rpc.mockResolvedValue({ data: null });
    await expect(reassessTaskRiskAfterRecoveryAction(attempt)).resolves.toBe(false);
    expect(mocks.rate).toHaveBeenCalledWith(expect.objectContaining({ mode: "fail-closed", key: "task-risk-recovery:owner" }));
    expect(mocks.rpc).toHaveBeenCalledWith("reserve_task_risk_reassessment", {
      p_user_id: "owner", p_attempt_id: attempt, p_allow_dispatch: false,
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("pairs a committed result after the AI HTTP response times out", async () => {
    mocks.rate.mockResolvedValue({ success: true });
    mocks.rpc.mockResolvedValueOnce({ data: { kind: "dispatch", id: request } }).mockResolvedValueOnce({ data: true });
    mocks.fetch.mockRejectedValue(new Error("timeout"));
    await expect(reassessTaskRiskAfterRecoveryAction(attempt)).resolves.toBe(true);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledWith(expect.objectContaining({
      retries: 0, body: { user_id: "owner", task_ids: [task], persist: true, recovery_request_id: request },
    }));
    expect(mocks.rpc).toHaveBeenLastCalledWith("pair_task_risk_reassessment", {
      p_user_id: "owner", p_attempt_id: attempt, p_request_id: request,
    });
  });

  it("reuses the persisted result while quota is unavailable", async () => {
    mocks.rate.mockResolvedValue({ success: false });
    mocks.rpc.mockResolvedValueOnce({ data: { kind: "persisted", id: request } }).mockResolvedValueOnce({ data: true });
    await expect(reassessTaskRiskAfterRecoveryAction(attempt)).resolves.toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

it("loads the saved historical prediction pair independently of latest risk", async () => {
  mocks.from.mockReturnValueOnce({
    ...filtered(null),
    order() { return this; },
    limit: async () => ({
      data: [{
        id: attempt, action_type: "reschedule", status: "applied",
        original_due_at: "2026-01-03T00:00:00Z", initiated_at: "2026-01-01T01:00:00Z",
        applied_at: "2026-01-01T02:00:00Z", evaluated_at: "2026-01-01T03:00:00Z",
        source_prediction_id: "before", reassessment_prediction_id: "saved", receipt_required: true, receipt_recorded_at: "2026-01-01T02:00:00Z",
      }],
    }),
  });
  const metadata = { prediction_mode: "native_ml", feature_schema_version: "native-task-risk-v2" };
  const prediction = { input_mode: "lumivox_native_features", model_version_id: "same-model", prediction_metadata: metadata };
  const ids = vi.fn(async () => ({
    data: [
      { ...prediction, id: "before", risk_probability: 0.76, created_at: "2026-01-01T00:00:00Z" },
      { ...prediction, id: "saved", risk_probability: 0.54, created_at: "2026-01-01T02:30:00Z" },
    ],
  }));
  mocks.from.mockReturnValueOnce({ ...filtered(null), in: ids });
  const history = await loadTaskRiskRecoveryHistoryAction(task);
  expect(ids).toHaveBeenCalledWith("id", ["before", "saved"]);
  expect(history?.[0].comparison?.delta).toBeCloseTo(-0.22);
  expect(mocks.from).toHaveBeenCalledTimes(2);
});
