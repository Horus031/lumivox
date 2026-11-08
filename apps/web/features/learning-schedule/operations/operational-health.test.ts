import { describe, expect, it, vi } from "vitest";
import { handleOperationalHealth } from "./operational-health";

const secret = "test-monitoring-secret-is-not-a-dispatch-secret";
const env = { LEARNING_SCHEDULE_MONITORING_SECRET: secret };
const request = (key = secret, signal?: AbortSignal) => new Request("http://localhost/api/internal/learning-schedule/health",
  { headers: { authorization: `Bearer ${key}` }, signal });
const healthy = {
  generatedAt: "2030-01-07T12:00:00+00:00",
  dispatch: { enabled: false, pendingDue: 0, oldestDueAgeSeconds: null, activeLeases: 0, expiredLeases: 0,
    uncertainAttempts: 0, unmatchedWebhooks: 0, oldestUnmatchedAgeSeconds: null, acceptedSubmissions24h: 0, deliveryFailures24h: 0 },
  missedSweep: { enabled: false, eligibleBacklog: 0 }, focus: { activeSessions: 0 }, capped: [],
};

describe("protected operational health", () => {
  it("rejects missing, incorrect and reused dispatch credentials without DB work", async () => {
    const read = vi.fn();
    expect((await handleOperationalHealth(new Request(request().url), env, read)).status).toBe(401);
    expect((await handleOperationalHealth(request("wrong"), env, read)).status).toBe(401);
    expect((await handleOperationalHealth(request(), { ...env, STUDY_REMINDER_DISPATCH_SECRET: secret }, read)).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });
  it("returns live, ready, normal and no-store when both gates are off", async () => {
    const response = await handleOperationalHealth(request(), env, async () => healthy);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ liveness: "live", readiness: "ready", operational: "normal", alerts: [], snapshot: healthy });
  });
  it("separates operational attention from database readiness", async () => {
    const response = await handleOperationalHealth(request(), env, async () => ({
      ...healthy, dispatch: { ...healthy.dispatch, uncertainAttempts: 1 },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ readiness: "ready", operational: "attention", alerts: ["uncertain_submissions"] });
  });
  it.each(["database", "malformed", "aborted"])("reports %s as unavailable without sensitive data", async failure => {
    const controller = new AbortController();
    if (failure === "aborted") controller.abort();
    const response = await handleOperationalHealth(request(secret, controller.signal), env, async () => {
      if (failure === "database") throw new Error("private diagnostic");
      return failure === "malformed" ? { token: "secret" } : healthy;
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      liveness: "live", readiness: "unavailable", operational: "unknown", error: "snapshot_unavailable",
    });
  });
});
