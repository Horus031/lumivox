import { beforeEach, describe, expect, it, vi } from "vitest";
import { predictTaskRiskAction } from "./task-risk-prediction.actions";
import { TASK_RISK_UI_FIXTURES } from "./task-risk-ui.fixtures";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), eq: vi.fn(), read: vi.fn(), rate: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("./task-risk-recovery.queries", () => ({ readRecoveryRisk: mocks.read }));
vi.mock("@/lib/redis/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/ai-api/fetch-ai-api", () => ({ fetchAiApi: mocks.fetch }));

const taskId = "467074c3-5698-47c7-ab6c-f1ca5c28c599";
const ready = TASK_RISK_UI_FIXTURES.find(item => item.id === "high")!.state;
let task: Record<string, unknown> | null;
beforeEach(() => {
  vi.resetAllMocks();
  task = { status: "todo", completed_at: null, due_at: new Date(Date.now() + 86400000).toISOString(), due_date: null };
  const query = { select() { return this; }, eq: mocks.eq, maybeSingle: vi.fn(async () => ({ data: task, error: null })) };
  mocks.eq.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  mocks.auth.mockResolvedValue({ user: { id: "owner" }, supabase: { from: mocks.from } });
  mocks.read.mockResolvedValue({ status: "unavailable" });
  mocks.rate.mockResolvedValue({ success: true });
  mocks.fetch.mockResolvedValue({ predictions: [], errors: [] });
});

describe("initial per-task risk prediction", () => {
  it("rejects an invalid ID before authentication or inference", async () => {
    expect((await predictTaskRiskAction("invalid")).success).toBe(false);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated callers", async () => {
    mocks.auth.mockRejectedValue(new Error("not authenticated"));
    expect((await predictTaskRiskAction(taskId)).success).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("checks ownership and rejects missing/cross-owner tasks before inference", async () => {
    task = null;
    expect((await predictTaskRiskAction(taskId)).success).toBe(false);
    expect(mocks.eq).toHaveBeenCalledWith("id", taskId);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each([
    { status: "completed" }, { status: "cancelled" },
    { completed_at: new Date().toISOString() }, { due_at: null },
    { due_at: new Date(Date.now() - 86400000).toISOString() },
    { due_at: new Date(Date.now() + 15 * 86400000).toISOString() },
  ])("rejects an ineligible task: %j", async (change) => {
    task = { ...task, ...change };
    expect(await predictTaskRiskAction(taskId)).toEqual({ success: false, error: "ineligible" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("reuses a valid persisted result without quota or another AI request", async () => {
    mocks.read.mockResolvedValue(ready);
    expect(await predictTaskRiskAction(taskId)).toEqual({ success: true, state: ready });
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("fails closed on quota/Redis rejection", async () => {
    mocks.rate.mockResolvedValue({ success: false });
    expect(await predictTaskRiskAction(taskId)).toEqual({ success: false, error: "limited" });
    expect(mocks.rate).toHaveBeenCalledWith({ key: "task-risk-prediction:owner", limit: 10, window: "1 h", mode: "fail-closed" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(["unavailable", "stale"])("persists only this task and reads validated state after %s", async status => {
    mocks.read.mockResolvedValueOnce({ status }).mockResolvedValueOnce(ready);
    expect(await predictTaskRiskAction(taskId)).toEqual({ success: true, state: ready });
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith({
      path: "/api/v1/native-task-risk/batch-predict", retries: 0,
      body: { user_id: "owner", task_ids: [taskId], persist: true },
    });
  });
  it("accepts persisted data after an HTTP timeout without blindly retrying", async () => {
    mocks.fetch.mockRejectedValue(new Error("transport timeout"));
    mocks.read.mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValueOnce(ready);
    expect((await predictTaskRiskAction(taskId)).success).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it.each(["unavailable", "stale", "ineligible"])("does not claim success for %s persisted state", async status => {
    mocks.read.mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValueOnce({ status });
    expect(await predictTaskRiskAction(taskId)).toEqual({ success: false, error: "unavailable" });
  });
  it("keeps upstream error details private when inference fails", async () => {
    mocks.fetch.mockRejectedValue(new Error("private service credentials"));
    expect(await predictTaskRiskAction(taskId)).toEqual({ success: false, error: "unavailable" });
  });
});
