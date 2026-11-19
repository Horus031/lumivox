import { describe, expect, it } from "vitest";
import {
  evaluateOperationalAlerts,
  operationalSnapshotSchema,
  type OperationalSnapshot,
} from "./operational-snapshot";

function snapshot(second = 3): OperationalSnapshot {
  return {
    generatedAt: `2030-01-07T12:00:0${second}+00:00`,
    dispatch: {
      enabled: false,
      pendingDue: 2,
      oldestDueAgeSeconds: 600,
      activeLeases: 1,
      expiredLeases: 1,
      uncertainAttempts: 0,
      unmatchedWebhooks: 0,
      oldestUnmatchedAgeSeconds: null,
      acceptedSubmissions24h: 0,
      deliveryFailures24h: 0,
    },
    missedSweep: { enabled: false, eligibleBacklog: second },
    focus: { activeSessions: 1 },
    capped: [],
  };
}

describe("operational snapshot and alert policy", () => {
  it("accepts a gate-OFF backlog without an incident", () => {
    const current = snapshot();
    expect(operationalSnapshotSchema.parse(current)).toEqual(current);
    expect(evaluateOperationalAlerts(current)).toEqual([]);
  });
  it("requires two ordered observations of expired leases", () => {
    expect(evaluateOperationalAlerts(snapshot(3), [snapshot(2)])).toEqual(["expired_leases"]);
    expect(evaluateOperationalAlerts(snapshot(3), [snapshot(3)])).toEqual([]);
  });
  it("alerts at strict age thresholds and independently of delivery acceptance", () => {
    const current = snapshot();
    Object.assign(current.dispatch, {
      enabled: true,
      oldestDueAgeSeconds: 300,
      unmatchedWebhooks: 1,
      oldestUnmatchedAgeSeconds: 900,
      uncertainAttempts: 1,
      acceptedSubmissions24h: 10,
    });
    expect(evaluateOperationalAlerts(current)).toEqual(["uncertain_submissions"]);
    current.dispatch.oldestDueAgeSeconds = 301;
    current.dispatch.oldestUnmatchedAgeSeconds = 901;
    expect(evaluateOperationalAlerts(current)).toEqual([
      "uncertain_submissions",
      "pending_due_age",
      "unmatched_webhooks",
    ]);
  });
  it("requires three increasing, uncapped, enabled sweep samples", () => {
    const [first, prior, current] = [1, 2, 3].map((i) => {
      const s = snapshot(i);
      s.missedSweep.enabled = true;
      s.dispatch.expiredLeases = 0;
      return s;
    });
    expect(evaluateOperationalAlerts(current, [first, prior])).toEqual(["missed_sweep_backlog"]);
    expect(evaluateOperationalAlerts(current, [prior])).toEqual([]);
    current.missedSweep.eligibleBacklog = 1001;
    current.capped = ["eligibleBacklog"];
    expect(evaluateOperationalAlerts(current, [first, prior])).toEqual([]);
    prior.missedSweep.enabled = false;
    expect(evaluateOperationalAlerts(snapshot(3), [first, prior])).not.toContain(
      "missed_sweep_backlog",
    );
  });
  it("rejects missing ages, undisclosed caps and unexpected sensitive fields", () => {
    const s = snapshot();
    expect(operationalSnapshotSchema.safeParse({ ...s, userId: "private" }).success).toBe(false);
    s.dispatch.oldestDueAgeSeconds = null;
    expect(operationalSnapshotSchema.safeParse(s).success).toBe(false);
    s.dispatch.oldestDueAgeSeconds = 600;
    s.dispatch.pendingDue = 1001;
    expect(operationalSnapshotSchema.safeParse(s).success).toBe(false);
    s.capped = ["pendingDue"];
    expect(operationalSnapshotSchema.safeParse(s).success).toBe(true);
  });
});
