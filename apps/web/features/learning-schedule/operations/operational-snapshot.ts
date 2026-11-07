import { z } from "zod";

const count = z.number().int().min(0).max(1001);
const age = z.number().int().nonnegative().nullable();
const capNames = ["pendingDue", "activeLeases", "expiredLeases", "uncertainAttempts", "unmatchedWebhooks",
  "acceptedSubmissions24h", "deliveryFailures24h", "eligibleBacklog", "activeSessions"] as const;

export const operationalSnapshotSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  dispatch: z.object({
    enabled: z.boolean(),
    pendingDue: count,
    oldestDueAgeSeconds: age,
    activeLeases: count,
    expiredLeases: count,
    uncertainAttempts: count,
    unmatchedWebhooks: count,
    oldestUnmatchedAgeSeconds: age,
    acceptedSubmissions24h: count,
    deliveryFailures24h: count,
  }).strict(),
  missedSweep: z.object({ enabled: z.boolean(), eligibleBacklog: count }).strict(),
  focus: z.object({ activeSessions: count }).strict(),
  capped: z.array(z.enum(capNames)).max(capNames.length),
}).strict().refine(snapshot => {
  const metrics = { ...snapshot.dispatch, ...snapshot.missedSweep, ...snapshot.focus };
  return (snapshot.dispatch.pendingDue === 0) === (snapshot.dispatch.oldestDueAgeSeconds === null)
    && (snapshot.dispatch.unmatchedWebhooks === 0) === (snapshot.dispatch.oldestUnmatchedAgeSeconds === null)
    && new Set(snapshot.capped).size === snapshot.capped.length
    && capNames.every(key => snapshot.capped.includes(key) === (metrics[key] === 1001));
});

export type OperationalSnapshot = z.infer<typeof operationalSnapshotSchema>;
type Alert = "expired_leases" | "uncertain_submissions" | "pending_due_age" | "unmatched_webhooks" | "missed_sweep_backlog";

/** Prior snapshots are ordered oldest to newest. Callers own polling and deduplication. */
export function evaluateOperationalAlerts(current: OperationalSnapshot, history: readonly OperationalSnapshot[] = []): Alert[] {
  const alerts: Alert[] = [];
  const { dispatch, missedSweep } = current;
  const previous = history.at(-1);
  const older = history.at(-2);
  const consecutive = previous && Date.parse(previous.generatedAt) < Date.parse(current.generatedAt);

  if (consecutive && previous.dispatch.expiredLeases > 0 && dispatch.expiredLeases > 0) alerts.push("expired_leases");
  if (dispatch.uncertainAttempts > 0) alerts.push("uncertain_submissions");
  if (dispatch.enabled && (dispatch.oldestDueAgeSeconds ?? 0) > 300) alerts.push("pending_due_age");
  if ((dispatch.oldestUnmatchedAgeSeconds ?? 0) > 900) alerts.push("unmatched_webhooks");
  if (consecutive && older && Date.parse(older.generatedAt) < Date.parse(previous.generatedAt)
    && [older, previous, current].every(sample => sample.missedSweep.enabled && !sample.capped.includes("eligibleBacklog"))
    && older.missedSweep.eligibleBacklog < previous.missedSweep.eligibleBacklog
    && previous.missedSweep.eligibleBacklog < missedSweep.eligibleBacklog) {
    alerts.push("missed_sweep_backlog");
  }
  return alerts;
}
