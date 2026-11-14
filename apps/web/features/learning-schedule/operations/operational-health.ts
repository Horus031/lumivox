import { createHash, timingSafeEqual } from "node:crypto";
import { evaluateOperationalAlerts, operationalSnapshotSchema } from "./operational-snapshot";

type Env = Readonly<Record<string, string | undefined>>;
type ReadSnapshot = (signal: AbortSignal) => Promise<unknown>;
const headers = { "Cache-Control": "no-store" };

function authorized(header: string | null, env: Env) {
  const secret = env.LEARNING_SCHEDULE_MONITORING_SECRET;
  if (
    !secret ||
    secret.length < 32 ||
    secret === env.STUDY_REMINDER_DISPATCH_SECRET ||
    !header?.startsWith("Bearer ") ||
    header.length > 512
  )
    return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header.slice(7)), digest(secret));
}

export async function handleOperationalHealth(
  request: Request,
  env: Env,
  readSnapshot: ReadSnapshot,
): Promise<Response> {
  if (!authorized(request.headers.get("authorization"), env)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(3000)]);
    const data = await readSnapshot(signal);
    signal.throwIfAborted();
    const snapshot = operationalSnapshotSchema.parse(data);
    const alerts = evaluateOperationalAlerts(snapshot);
    return Response.json(
      {
        liveness: "live",
        readiness: "ready",
        operational: alerts.length ? "attention" : "normal",
        alerts,
        snapshot,
      },
      { headers },
    );
  } catch {
    return Response.json(
      {
        liveness: "live",
        readiness: "unavailable",
        operational: "unknown",
        error: "snapshot_unavailable",
      },
      { status: 503, headers },
    );
  }
}
