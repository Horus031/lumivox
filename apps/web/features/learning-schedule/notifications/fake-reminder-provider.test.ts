import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeReminderProvider, type FakeProviderOutcome, type FakeReminderRequest } from "./fake-reminder-provider";
import { assertLocalReminderTarget, dispatchFakeReminderBatch, type FakeDispatchStore } from "./fake-reminder-dispatcher";

const request: FakeReminderRequest = { jobId: "fixture-job", attemptNumber: 1, idempotencyKey: "fixture-key", locale: "en", sessionStartAt: "2030-01-01T12:00Z" };
const claim = { jobId: request.jobId, leaseToken: "fixture-token" };
const local = "http://127.0.0.1:55321";
afterEach(() => vi.unstubAllGlobals());

describe("local fake reminder provider/worker", () => {
  it.each<FakeProviderOutcome>([
    { kind: "accepted", messageId: "fake-1" },
    { kind: "transient", code: "rate_limited", retryAfterMs: 30000 },
    { kind: "transient", code: "server_error" },
    { kind: "permanent", code: "rejected" },
    { kind: "uncertain", code: "response_lost" },
  ])("preserves the $kind contract without network calls", async outcome => {
    const network = vi.fn(() => { throw new Error("Network forbidden"); });
    vi.stubGlobal("fetch", network);
    const simulate = vi.fn(() => outcome);
    const provider = new FakeReminderProvider(simulate);
    expect(await provider.submit(request)).toEqual(outcome);
    expect(simulate).toHaveBeenCalledWith(request);
    expect(network).not.toHaveBeenCalled();
    expect(Object.keys(request).sort()).toEqual(["attemptNumber", "idempotencyKey", "jobId", "locale", "sessionStartAt"]);
  });
  it.each(["https://remote.supabase.co", "http://localhost:54321", "http://127.0.0.1.evil:55321", "http://user:pass@localhost:55321", "http://localhost:55321/rest/v1", "http://localhost:55321/?remote=1"])("rejects unsafe target %s before DB/provider calls", async target => {
    const store = { claim: vi.fn(), authorize: vi.fn(), record: vi.fn() };
    const submit = vi.fn();
    await expect(dispatchFakeReminderBatch(target, store, { submit })).rejects.toThrow("local Supabase");
    expect(store.claim).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
  });
  it("allows the two explicit loopback hostnames", () => {
    expect(() => assertLocalReminderTarget(local)).not.toThrow();
    expect(() => assertLocalReminderTarget("http://localhost:55321")).not.toThrow();
  });
  it("gate OFF / no claims never invokes provider", async () => {
    const store: FakeDispatchStore = { claim: vi.fn().mockResolvedValue([]), authorize: vi.fn(), record: vi.fn() };
    const provider = new FakeReminderProvider(vi.fn());
    expect(await dispatchFakeReminderBatch(local, store, provider)).toEqual({ claimed: 0, submissions: 0 });
    expect(store.authorize).not.toHaveBeenCalled(); expect(store.record).not.toHaveBeenCalled();
  });
  it("committed authorization precedes provider and record; denial makes no submission", async () => {
    const order: string[] = [];
    const store: FakeDispatchStore = {
      claim: async () => [claim, claim],
      authorize: vi.fn().mockImplementationOnce(async () => { order.push("handoff-commit"); return { authorized: true, request }; })
        .mockResolvedValueOnce({ authorized: false, reason: "handoff_already_started" }),
      record: async () => { order.push("outcome-commit"); },
    };
    const provider = new FakeReminderProvider(() => { order.push("provider"); return { kind: "accepted", messageId: "fake-1" }; });
    expect(await dispatchFakeReminderBatch(local, store, provider)).toEqual({ claimed: 2, submissions: 1 });
    expect(order).toEqual(["handoff-commit", "provider", "outcome-commit"]);
  });
  it("records a thrown provider error as uncertain, never transient", async () => {
    const store: FakeDispatchStore = { claim: async () => [claim], authorize: async () => ({ authorized: true, request }), record: vi.fn() };
    await dispatchFakeReminderBatch(local, store, new FakeReminderProvider(() => { throw new Error("response lost"); }));
    expect(store.record).toHaveBeenCalledExactlyOnceWith(claim, { kind: "uncertain", code: "timeout" });
  });
  it("outcome storage failure propagates without a second submission", async () => {
    const record = vi.fn().mockRejectedValue(new Error("DB unavailable"));
    const simulate = vi.fn((): FakeProviderOutcome => ({ kind: "accepted", messageId: "fake-1" }));
    const store: FakeDispatchStore = { claim: async () => [claim], authorize: async () => ({ authorized: true, request }), record };
    await expect(dispatchFakeReminderBatch(local, store, new FakeReminderProvider(simulate))).rejects.toThrow("DB unavailable");
    expect(simulate).toHaveBeenCalledTimes(1); expect(record).toHaveBeenCalledTimes(1);
  });
  it("rejects an oversized adapter batch", async () => {
    const store: FakeDispatchStore = { claim: async () => Array(26).fill(claim), authorize: vi.fn(), record: vi.fn() };
    await expect(dispatchFakeReminderBatch(local, store, new FakeReminderProvider(vi.fn()))).rejects.toThrow("exceeded 25");
    expect(store.authorize).not.toHaveBeenCalled();
  });
});
