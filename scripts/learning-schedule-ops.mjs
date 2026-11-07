const commands = new Set(["snapshot", "inspect-queue", "inspect-uncertain", "inspect-webhooks", "verify-gates"]);
const dispatchCounts = ["pendingDue", "activeLeases", "expiredLeases", "uncertainAttempts", "unmatchedWebhooks",
  "acceptedSubmissions24h", "deliveryFailures24h"];
const countFields = [...dispatchCounts, "eligibleBacklog", "activeSessions"];

function count(value, maximum = 1001) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error();
  return value;
}

function flag(value) {
  if (typeof value !== "boolean") throw new Error();
  return value;
}

function project(body) {
  const { dispatch, missedSweep, focus, generatedAt, capped } = body.snapshot;
  const metrics = { ...dispatch, ...missedSweep, ...focus };
  if (body.readiness !== "ready" || typeof generatedAt !== "string" || !Number.isFinite(Date.parse(generatedAt))
    || !Array.isArray(capped) || new Set(capped).size !== capped.length || !capped.every(key => countFields.includes(key))
    || countFields.some(key => capped.includes(key) !== (metrics[key] === 1001))) throw new Error();
  const age = (value, total) => {
    if ((total === 0) !== (value === null)) throw new Error();
    return value === null ? null : count(value, Number.MAX_SAFE_INTEGER);
  };
  return {
    generatedAt: new Date(generatedAt).toISOString(),
    dispatch: {
      enabled: flag(dispatch.enabled),
      ...Object.fromEntries(dispatchCounts.map(key => [key, count(dispatch[key])])),
      oldestDueAgeSeconds: age(dispatch.oldestDueAgeSeconds, dispatch.pendingDue),
      oldestUnmatchedAgeSeconds: age(dispatch.oldestUnmatchedAgeSeconds, dispatch.unmatchedWebhooks),
    },
    missedSweep: { enabled: flag(missedSweep.enabled), eligibleBacklog: count(missedSweep.eligibleBacklog) },
    focus: { activeSessions: count(focus.activeSessions) },
    capped,
  };
}

async function run(command) {
  const origin = new URL(process.env.LEARNING_SCHEDULE_OPS_ORIGIN);
  const token = process.env.LEARNING_SCHEDULE_MONITORING_SECRET;
  if (!token || token.length < 32 || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash
    || (origin.protocol !== "https:" && !(origin.protocol === "http:" && origin.hostname === "127.0.0.1"))) throw new Error();
  const response = await fetch(new URL("/api/internal/learning-schedule/health", origin), {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 401 || response.status === 403) {
    console.error("diagnostics_unauthorized");
    process.exitCode = 3;
    return;
  }
  if (!response.ok) throw new Error();
  const snapshot = project(await response.json());
  const { generatedAt, dispatch, missedSweep, capped } = snapshot;
  const { enabled, pendingDue, oldestDueAgeSeconds, activeLeases, expiredLeases,
    uncertainAttempts, unmatchedWebhooks, oldestUnmatchedAgeSeconds } = dispatch;
  const views = {
    snapshot,
    "inspect-queue": { generatedAt, enabled, pendingDue, oldestDueAgeSeconds, activeLeases, expiredLeases,
      capped: capped.filter(key => ["pendingDue", "activeLeases", "expiredLeases"].includes(key)) },
    "inspect-uncertain": { generatedAt, uncertainAttempts, capped: capped.includes("uncertainAttempts") },
    "inspect-webhooks": { generatedAt, unmatchedWebhooks, oldestUnmatchedAgeSeconds, capped: capped.includes("unmatchedWebhooks") },
    "verify-gates": { generatedAt, dispatchEnabled: enabled, missedSweepEnabled: missedSweep.enabled },
  };
  console.log(JSON.stringify(views[command]));
}

const command = process.argv[2];
if (process.argv.length !== 3 || !commands.has(command)) {
  console.error("Usage: node scripts/learning-schedule-ops.mjs snapshot|inspect-queue|inspect-uncertain|inspect-webhooks|verify-gates");
  process.exitCode = 2;
} else {
  await run(command).catch(() => {
    console.error("diagnostics_unavailable");
    process.exitCode = 1;
  });
}
