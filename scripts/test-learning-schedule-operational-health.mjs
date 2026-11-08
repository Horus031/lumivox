import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const base = process.env.OPERATIONAL_HEALTH_TEST_URL;
const secret = process.env.LEARNING_SCHEDULE_MONITORING_SECRET;
const dispatchSecret = process.env.STUDY_REMINDER_DISPATCH_SECRET;
assert.equal(base, "http://127.0.0.1:3119");
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:55321");
assert(secret && dispatchSecret && secret !== dispatchSecret);
const db = "supabase_db_lumivox-proj", rest = "supabase_rest_lumivox-proj";
const owner = "100a0000-0000-4000-8000-000000000010";
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", windowsHide: true }).trim();
const sql = query => docker("exec", db, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", query);
const counts = () => sql(`SELECT (SELECT count(*) FROM auth.users), (SELECT count(*) FROM public.tasks),
  (SELECT count(*) FROM public.study_notification_jobs), (SELECT count(*) FROM public.study_notification_deliveries),
  (SELECT enabled FROM public.study_notification_dispatch_control), (SELECT enabled FROM public.ls_missed_sweep_control)`);
const digest = () => sql(`SELECT md5(jsonb_build_array(
  (SELECT jsonb_agg(j ORDER BY id) FROM public.study_notification_jobs j),
  (SELECT jsonb_agg(d ORDER BY id) FROM public.study_notification_deliveries d),
  (SELECT jsonb_agg(r ORDER BY id) FROM public.study_notification_webhook_receipts r),
  (SELECT jsonb_agg(s ORDER BY id) FROM public.task_study_sessions s),
  (SELECT jsonb_agg(e ORDER BY id) FROM public.task_study_session_events e))::text)`);
const read = (token, method = "GET") => fetch(`${base}/api/internal/learning-schedule/health`, {
  method, headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(8000),
});

assert.equal(counts(), "0|0|0|0|f|f", "expected empty, gates-OFF local database");
assert.equal(docker("inspect", "--format", "{{.State.Status}}", rest), "running");
assert.equal((await read()).status, 401);
assert.equal((await read("wrong")).status, 401);
assert.equal((await read(dispatchSecret)).status, 401);
assert.equal((await read(secret, "POST")).status, 405);
const idle = await read(secret);
assert.equal(idle.status, 200);
const idleBody = await idle.json();
assert.equal(idleBody.readiness, "ready");
assert.equal(idleBody.operational, "normal");
assert.deepEqual(idleBody.alerts, []);

try {
  sql(`BEGIN;
    INSERT INTO auth.users(id,email) VALUES ('${owner}','health-http@example.invalid');
    INSERT INTO public.profiles(id) VALUES ('${owner}') ON CONFLICT DO NOTHING;
    CREATE TEMP TABLE ids AS SELECT gen_random_uuid() task, gen_random_uuid() schedule;
    INSERT INTO public.tasks(id,user_id,title,status) SELECT task,'${owner}','Private health fixture','todo' FROM ids;
    INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
      SELECT schedule,'${owner}',task,'2030-01-07','2030-01-07','UTC' FROM ids;
    INSERT INTO public.task_study_sessions(user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,
      local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
      SELECT '${owner}',task,schedule,1,label,'2030-01-07',begin_at,end_at,'UTC',
        (date '2030-01-07'+begin_at) AT TIME ZONE 'UTC',(date '2030-01-07'+end_at) AT TIME ZONE 'UTC'
      FROM ids CROSS JOIN (VALUES ('due',time '10:00',time '11:00'),('leased',time '12:00',time '13:00')) x(label,begin_at,end_at);
    INSERT INTO public.study_notification_jobs(user_id,session_id,schedule_revision,due_at,next_attempt_at,status,
      lease_token,lease_until,attempt_count,idempotency_key)
      SELECT user_id,id,1,now()-interval '10 minutes',now()-interval '5 minutes',
        CASE logical_occurrence_key WHEN 'due' THEN 'pending' ELSE 'leased' END,
        CASE logical_occurrence_key WHEN 'leased' THEN gen_random_uuid() END,
        CASE logical_occurrence_key WHEN 'leased' THEN now()-interval '1 minute' END,
        CASE logical_occurrence_key WHEN 'leased' THEN 1 ELSE 0 END,logical_occurrence_key
      FROM public.task_study_sessions WHERE user_id='${owner}';
    INSERT INTO public.study_notification_deliveries(job_id,user_id,attempt_number,status,error_code)
      SELECT id,user_id,1,'uncertain','PRIVATE-FIXTURE-ERROR' FROM public.study_notification_jobs WHERE status='leased';
    COMMIT;`);
  const before = digest();
  const response = await read(secret);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const raw = await response.text();
  for (const privateValue of [owner, "Private health fixture", "health-http@example.invalid", "PRIVATE-FIXTURE-ERROR"]) {
    assert(!raw.includes(privateValue));
  }
  const body = JSON.parse(raw);
  assert.equal(body.liveness, "live");
  assert.equal(body.readiness, "ready");
  assert.equal(body.operational, "attention");
  assert.deepEqual(body.alerts, ["uncertain_submissions"]);
  assert.equal(body.snapshot.dispatch.enabled, false);
  assert.equal(body.snapshot.missedSweep.enabled, false);
  assert.equal(body.snapshot.dispatch.pendingDue, 1);
  assert(body.snapshot.dispatch.oldestDueAgeSeconds >= 600);
  assert.equal(body.snapshot.dispatch.expiredLeases, 1);
  assert.equal(body.snapshot.dispatch.uncertainAttempts, 1);
  assert.equal(digest(), before);

  docker("pause", rest);
  try {
    const outage = await read(secret);
    assert.equal(outage.status, 503);
    assert.deepEqual(await outage.json(), {
      liveness: "live", readiness: "unavailable", operational: "unknown", error: "snapshot_unavailable",
    });
  } finally {
    docker("unpause", rest);
  }
  let recovered = false;
  for (let attempt = 0; attempt < 5 && !recovered; attempt++) {
    recovered = (await read(secret)).status === 200;
    if (!recovered) await delay(250);
  }
  assert(recovered);
  assert.equal(digest(), before);
  console.log("PASS: 401/405, 200 aggregate, 503 PostgREST unavailable, 200 recovered, rows unchanged");
} finally {
  sql(`DELETE FROM auth.users WHERE id='${owner}'`);
  assert.equal(counts(), "0|0|0|0|f|f");
}
