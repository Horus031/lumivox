import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { q, sql, verifyEmpty } from "./lib/learning-schedule-load-fixtures.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const web = resolve(root, "apps/web");
const origin = "http://127.0.0.1:3119";
const api = "http://127.0.0.1:55321";
const proxyOrigin = "http://127.0.0.1:8098";
const db = "supabase_db_lumivox-proj";
const service = process.env.LEARNING_SCHEDULE_TEST_SERVICE_KEY;
const monitoring = randomBytes(32).toString("hex");
const dispatch = randomBytes(32).toString("hex");
const exec = promisify(execFile);
const env = {
  ...process.env,
  LEARNING_SCHEDULE_OPS_ORIGIN: origin,
  LEARNING_SCHEDULE_MONITORING_SECRET: monitoring,
  STUDY_REMINDER_DISPATCH_SECRET: dispatch,
  STUDY_REMINDER_REAL_SEND_ENABLED: "false",
  NEXT_PUBLIC_SUPABASE_URL: proxyOrigin,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? service,
  SUPABASE_SERVICE_ROLE_KEY: service,
};
const owner = randomUUID(),
  task = randomUUID(),
  schedule = randomUUID();
const email = "ops-private@example.invalid",
  title = "PRIVATE-OPS-TASK";
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const rpc = (name) =>
  fetch(`${api}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: service,
      "content-type": "application/json",
      ...(service.startsWith("sb_secret_") ? {} : { authorization: `Bearer ${service}` }),
    },
    body: "{}",
    signal: AbortSignal.timeout(5000),
  });
const cli = async (command, secret = monitoring) => {
  const { stdout } = await exec(
    process.execPath,
    [resolve(root, "scripts/learning-schedule-ops.mjs"), command],
    {
      cwd: root,
      env: { ...env, LEARNING_SCHEDULE_MONITORING_SECRET: secret },
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const privateValue of [service, monitoring, dispatch, owner, email, title])
    assert(!stdout.includes(privateValue));
  return JSON.parse(stdout);
};
async function rejectsCli(secret, code, message) {
  await assert.rejects(
    cli("snapshot", secret),
    (error) => error.code === code && error.stdout === "" && error.stderr.trim() === message,
  );
}
const evidence = {
  baseline: git("rev-parse", "HEAD"),
  startedAt: new Date().toISOString(),
  cases: {},
  realProviderRequests: 0,
};
const record = (id, data) => {
  evidence.cases[id] = data;
  console.log(`PASS ${id}`);
};
let server, exited;
const proxy = createServer(async (request, response) => {
  const path = "/rest/v1/rpc/ls_learning_schedule_operational_snapshot";
  if (request.method !== "GET" || request.url?.split("?")[0] !== path) {
    response.writeHead(404).end();
    return;
  }
  try {
    const upstream = await fetch(new URL(path, api), {
      headers: {
        apikey: request.headers.apikey,
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(2500),
    });
    response
      .writeHead(upstream.status, { "content-type": "application/json" })
      .end(await upstream.text());
  } catch {
    response.writeHead(503).end();
  }
});
async function start(artifact = web) {
  server = spawn(
    process.execPath,
    [
      resolve(artifact, "node_modules/next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      "3119",
    ],
    { cwd: artifact, env, windowsHide: true, stdio: "ignore" },
  );
  exited = once(server, "exit");
  for (let i = 0; i < 40; i++) {
    assert.equal(server.exitCode, null, "Next.js failed to start");
    try {
      const response = await fetch(`${origin}/api/internal/learning-schedule/health`, {
        headers: { authorization: `Bearer ${monitoring}`, connection: "close" },
        signal: AbortSignal.timeout(2000),
      });
      if (response.status === 200) return;
    } catch {
      /* startup */
    }
    await delay(250);
  }
  throw new Error("Next.js did not become ready");
}
async function stop() {
  if (!server) return;
  if (server.exitCode === null && server.signalCode === null) server.kill();
  await exited;
  server = undefined;
}
const digest = () =>
  sql(`SELECT md5(jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tasks t),
  (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.task_study_schedules s),
  (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.task_study_sessions s),
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.task_study_session_events e),
  (SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM public.study_notification_jobs j),
  (SELECT jsonb_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations))::text)`);

assert.equal(process.env.LEARNING_SCHEDULE_TEST_URL, api);
assert(service);
verifyEmpty();
assert.equal(docker("inspect", "--format", "{{.State.Status}}", db), "running");
try {
  await new Promise((ready, reject) =>
    proxy.once("error", reject).listen(8098, "127.0.0.1", ready),
  );
  const rollbackWeb = process.env.LEARNING_SCHEDULE_OPS_ROLLBACK_WEB;
  const rollbackSha =
    rollbackWeb && (await readFile(resolve(rollbackWeb, ".ops-source-sha"), "utf8")).trim();
  if (rollbackSha) {
    assert.match(rollbackSha, /^[a-f0-9]{40}$/);
    assert.notEqual(rollbackSha, evidence.baseline);
    git("merge-base", "--is-ancestor", rollbackSha, evidence.baseline);
    assert.notEqual(
      await readFile(resolve(rollbackWeb, ".next/BUILD_ID"), "utf8"),
      await readFile(resolve(web, ".next/BUILD_ID"), "utf8"),
    );
  }
  await start();
  const idle = await cli("snapshot");
  assert.equal(idle.dispatch.enabled, false);
  assert.equal(idle.missedSweep.enabled, false);
  assert.equal(idle.dispatch.pendingDue, 0);
  record("OR-01", { dispatch: false, missedSweep: false, pendingDue: 0 });
  const wrong = randomBytes(32).toString("hex");
  for (const secret of [undefined, wrong, dispatch]) {
    const denied = await fetch(`${origin}/api/internal/learning-schedule/health`, {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: "unauthorized" });
  }
  await rejectsCli(wrong, 3, "diagnostics_unauthorized");
  await rejectsCli(dispatch, 3, "diagnostics_unauthorized");
  assert.equal(
    sql(`SELECT has_function_privilege('anon','public.ls_learning_schedule_operational_snapshot()','EXECUTE'),
    has_function_privilege('authenticated','public.ls_learning_schedule_operational_snapshot()','EXECUTE')`),
    "f|f",
  );
  record("OR-02", {
    missingSecret: 401,
    invalidSecret: 401,
    dispatchSecret: 401,
    anonRpc: false,
    authenticatedRpc: false,
  });
  const realSend = await fetch(`${origin}/api/internal/study-reminders/dispatch`, {
    method: "POST",
    headers: { authorization: `Bearer ${dispatch}`, "content-type": "application/json" },
    body: JSON.stringify({ dryRun: false }),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(realSend.status, 503);
  assert.deepEqual(await realSend.json(), { error: "real_send_disabled" });
  evidence.realSendGate = { enabled: false, http: 503 };

  const { stdout: worker } = await exec(
    process.execPath,
    [resolve(root, "scripts/test-learning-schedule-recovery.mjs"), "--operations"],
    {
      cwd: root,
      env,
      encoding: "utf8",
      windowsHide: true,
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const recovery = JSON.parse(worker.trim().split(/\r?\n/).at(-1));
  assert(recovery.cleanup);
  evidence.notificationCases = recovery.notificationCases;
  evidence.fakeSubmissions = recovery.fakeSubmissions;
  const observed = Object.fromEntries(
    recovery.notificationCases.map((result) => [result.case, result]),
  );
  record("OR-03", {
    uncertainAttempts: observed.enable_with_uncertain.after.snapshot.dispatch.uncertainAttempts,
    submissionsAfterEnable: observed.enable_with_uncertain.submissionsAfterEnable,
  });
  record("OR-04", {
    blockerObserved: observed.claim_fence_and_pre_handoff_reconcile.blockerObserved,
    reconciledState: observed.claim_fence_and_pre_handoff_reconcile.after.state.job,
  });
  record("OR-05", { fakeSubmissions: observed.before_handoff.fakeSubmissions });
  record("OR-06", {
    fakeSubmissions: observed.handoff_committed.fakeSubmissions,
    delivery: observed.handoff_committed.after.state.delivery,
  });
  record("OR-07", {
    unmatchedWebhooks: observed.unmatched_receipt.after.snapshot.dispatch.unmatchedWebhooks,
  });

  sql(`BEGIN;
    INSERT INTO auth.users(id,email) VALUES (${q(owner)},${q(email)});
    INSERT INTO public.tasks(id,user_id,title,status) VALUES (${q(task)},${q(owner)},${q(title)},'todo');
    INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
      VALUES (${q(schedule)},${q(owner)},${q(task)},current_date-2,current_date-2,'UTC');
    INSERT INTO public.task_study_sessions(user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,
      local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
      VALUES (${q(owner)},${q(task)},${q(schedule)},1,'ops-overdue',current_date-2,'10:00','11:00','UTC',
        ((current_date-2)+time '10:00') AT TIME ZONE 'UTC',((current_date-2)+time '11:00') AT TIME ZONE 'UTC');
    INSERT INTO public.study_notification_jobs(user_id,session_id,schedule_revision,due_at,next_attempt_at,idempotency_key)
      SELECT user_id,id,1,scheduled_start_at,scheduled_start_at,'ops-rollback-fixture'
      FROM public.task_study_sessions WHERE user_id=${q(owner)};
    COMMIT;`);
  const before = digest();
  assert.equal((await cli("snapshot")).missedSweep.eligibleBacklog, 1);
  sql("UPDATE public.ls_missed_sweep_control SET enabled=true WHERE singleton");
  assert.equal((await cli("verify-gates")).missedSweepEnabled, true);
  sql("UPDATE public.ls_missed_sweep_control SET enabled=false WHERE singleton");
  assert.equal((await cli("verify-gates")).missedSweepEnabled, false);
  const sweep = await rpc("ls_run_missed_sweep_if_enabled");
  assert.equal(sweep.status, 200);
  assert.equal(await sweep.json(), 0);
  assert.equal(digest(), before);
  record("OR-08", { eligible: 1, marked: 0, persistedRowsUnchanged: true });

  docker("pause", db);
  try {
    await rejectsCli(monitoring, 1, "diagnostics_unavailable");
  } finally {
    docker("unpause", db);
  }
  let recovered = false;
  for (let i = 0; i < 5 && !recovered; i++) {
    try {
      recovered = (await cli("snapshot")).missedSweep.eligibleBacklog === 1;
    } catch {
      await delay(250);
    }
  }
  assert(recovered);
  record("OR-09", { databasePaused: true, diagnosticExit: 1, recovered: true });
  for (const name of [
    "snapshot",
    "inspect-queue",
    "inspect-uncertain",
    "inspect-webhooks",
    "verify-gates",
  ])
    await cli(name);
  assert.equal(digest(), before);
  record("OR-10", {
    aggregateOnly: true,
    credentialsAndFixtureValuesAbsent: true,
    persistedRowsUnchanged: true,
  });

  assert.equal(
    git("status", "--porcelain", "--", "apps/web", "services/ai-api", "supabase/migrations"),
    "",
    "Rollback target must match the baseline application and migrations",
  );
  await stop();
  await rejectsCli(monitoring, 1, "diagnostics_unavailable");
  assert.equal(digest(), before);
  await start(rollbackWeb);
  const restarted = await cli("snapshot");
  assert.equal(restarted.dispatch.enabled, false);
  assert.equal(restarted.missedSweep.enabled, false);
  assert.equal(restarted.missedSweep.eligibleBacklog, 1);
  assert.equal(restarted.dispatch.pendingDue, 1);
  assert.equal(digest(), before);
  const rollback = {
    baselineAppRestart: !rollbackSha,
    crossVersionSwap: Boolean(rollbackSha),
    rollbackSha: rollbackSha || null,
    fixtureAndMigrationDigestUnchanged: true,
  };
  if (rollbackSha) record("OR-11", rollback);
  else evidence.cases["OR-11"] = { ...rollback, status: "PARTIAL" };
} finally {
  await stop();
  if (proxy.listening) {
    proxy.closeAllConnections();
    await new Promise((done) => proxy.close(done));
  }
  sql(`UPDATE public.ls_missed_sweep_control SET enabled=false WHERE singleton AND enabled;
    DELETE FROM auth.users WHERE id=${q(owner)}`);
  evidence.final = verifyEmpty();
  const remaining = sql(`SELECT
    (SELECT count(*) FROM public.task_study_schedules), (SELECT count(*) FROM public.task_study_sessions),
    (SELECT count(*) FROM public.task_study_session_events), (SELECT count(*) FROM public.task_study_focus_attributions),
    (SELECT count(*) FROM public.study_notification_deliveries), (SELECT count(*) FROM public.study_notification_resend_payloads),
    (SELECT count(*) FROM public.study_notification_unsubscribe_tokens)`);
  assert.equal(remaining, "0|0|0|0|0|0|0");
  evidence.cleanup = { fixtureRows: 0, dispatch: false, missedSweep: false, reminderCron: 0 };
  evidence.migrations = Number(sql("SELECT count(*) FROM supabase_migrations.schema_migrations"));
  assert.equal(evidence.migrations, 94);
  evidence.finishedAt = new Date().toISOString();
  await writeFile(
    resolve(root, "docs/learning-schedule/phase-10-operations.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
}
