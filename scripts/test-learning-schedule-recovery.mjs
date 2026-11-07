import assert from "node:assert/strict";
import { execFileSync, fork } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadReminderRuntime } from "./lib/load-learning-schedule-runtime.mjs";

const file = fileURLToPath(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(resolve(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");
const api = process.env.LEARNING_SCHEDULE_TEST_URL;
const key = process.env.LEARNING_SCHEDULE_TEST_SERVICE_KEY;
assert.equal(api, "http://127.0.0.1:55321");
assert(key, "Local service key required");
const db = createClient(api, key, { auth: { persistSession: false, autoRefreshToken: false } });
const email = "recovery-fixture@example.invalid";
const from = "Lumivox <study@example.invalid>";
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const sha = value => createHash("sha256").update(value).digest("hex");
const sql = query => execFileSync("docker", ["exec", "supabase_db_lumivox-proj", "psql", "-X", "-qAt",
  "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", query],
{ encoding: "utf8", windowsHide: true }).trim();

async function rpc(name, input = {}) {
  const { data, error } = await db.rpc(name, input).abortSignal(AbortSignal.timeout(5000));
  if (error) throw new Error(`${name}: ${error.code}`);
  return data;
}

async function worker() {
  const [input] = await once(process, "message");
  const runtime = await loadReminderRuntime(root);
  const { ResendReminderProvider } = await import("../apps/web/.next/step-8d-runtime/resend-reminder-provider.mjs");
  const provider = new URL(input.provider);
  assert.equal(provider.hostname, "127.0.0.1");
  assert.equal(provider.protocol, "http:");
  const client = createClient(api, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => {
      const response = await fetch(url, options);
      if (!response.ok && String(url).endsWith("/ls_notification_record_resend_outcome")) {
        process.send({ sqlstate: (await response.clone().json()).code });
      }
      return response;
    } },
  });
  const store = runtime.store.createResendDispatchStore(client);
  async function checkpoint(name) {
    if (input.checkpoint !== name) return;
    const resume = once(process, "message");
    process.send({ checkpoint: name });
    await resume;
  }
  const observedStore = {
    ...store,
    async claim(size) {
      const result = await store.claim(size);
      if (result.length) await checkpoint("claim_committed");
      return result;
    },
    async prepare(...args) {
      const result = await store.prepare(...args);
      await checkpoint("payload_prepared");
      return result;
    },
    async authorize(...args) {
      await checkpoint("before_handoff");
      const result = await store.authorize(...args);
      if (result.authorized) await checkpoint("handoff_committed");
      return result;
    },
    async record(...args) {
      await checkpoint("provider_accepted");
      await store.record(...args);
    },
  };
  const transport = new ResendReminderProvider({ emails: { async send(request, options) {
    const response = await fetch(provider, { method: "POST", body: JSON.stringify(request),
      headers: { "content-type": "application/json", "idempotency-key": options.idempotencyKey },
      signal: options.signal });
    return response.json();
  } } }, from);
  const counts = await runtime.worker.dispatchResendReminders(observedStore, transport, {
    enabled: true, allowlist: new Set([email]), identityKey: input.identityKey,
    encryptionKey: Buffer.from(input.encryptionKey, "hex"), from, trustedOrigin: "https://app.lumivox.test",
  }, { batchSize: 1 });
  process.send({ counts }, () => process.disconnect());
}

if (process.argv.includes("--worker")) {
  await worker().catch(() => {
    process.send({ failure: "worker_failed" }, () => process.disconnect());
    process.exitCode = 1;
  });
} else {
  await run();
}

async function run() {
  const report = { baseline: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    startedAt: new Date().toISOString(), notificationCases: [], realProviderRequests: 0, cleanup: false };
  const identityKey = randomBytes(32).toString("hex"), encryptionKey = randomBytes(32).toString("hex");
  const counts = () => JSON.parse(sql(`SELECT json_build_object(
    'users',(SELECT count(*) FROM auth.users),'tasks',(SELECT count(*) FROM public.tasks),
    'jobs',(SELECT count(*) FROM public.study_notification_jobs),'deliveries',(SELECT count(*) FROM public.study_notification_deliveries),
    'payloads',(SELECT count(*) FROM public.study_notification_resend_payloads),'tokens',(SELECT count(*) FROM public.study_notification_unsubscribe_tokens),
    'receipts',(SELECT count(*) FROM public.study_notification_webhook_receipts),
    'identities',(SELECT count(*) FROM public.study_notification_recipient_identities),
    'suppressions',(SELECT count(*) FROM public.study_notification_suppressions),
    'dispatch',(SELECT enabled FROM public.study_notification_dispatch_control),'sweep',(SELECT enabled FROM public.ls_missed_sweep_control),
    'reminderCron',(SELECT count(*) FROM cron.job WHERE jobname ILIKE '%remind%' OR jobname ILIKE '%notification%'))`));
  assert(Object.values(counts()).every(value => value === 0 || value === false), "Disposable local DB must be empty and gates OFF");
  const observations = [];
  let loseResponse = false;
  const fake = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/emails") { response.writeHead(404).end(); return; }
    const parts = [];
    for await (const chunk of request) parts.push(chunk);
    const messageId = randomUUID();
    // Record the accepted fake submission before possibly losing its response.
    observations.push({ messageId, key: request.headers["idempotency-key"], bodyHash: sha(Buffer.concat(parts)) });
    if (loseResponse) response.destroy();
    else response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: { id: messageId }, error: null }));
  });
  await new Promise((resolveListen, reject) => {
    fake.once("error", reject).listen(0, "127.0.0.1", resolveListen);
  });
  const provider = `http://127.0.0.1:${fake.address().port}/emails`;
  const running = new Set();
  const receiptIds = [];
  let owner;

  function spawnWorker(checkpoint, wrongKey = false) {
    const child = fork(file, ["--worker"], { cwd: root, stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true });
    running.add(child);
    const messages = [];
    child.on("message", message => messages.push(message));
    const exited = once(child, "exit").then(([code, signal]) => { running.delete(child); return { code, signal }; });
    child.send({ checkpoint, provider, identityKey, encryptionKey: wrongKey ? randomBytes(32).toString("hex") : encryptionKey });
    return {
      async barrier() {
        const deadline = Date.now() + 12_000;
        while (Date.now() < deadline && child.exitCode === null && child.signalCode === null) {
          if (messages.some(message => message.checkpoint === checkpoint)) return;
          await new Promise(done => setTimeout(done, 25));
        }
        throw new Error(`Worker did not reach ${checkpoint}: ${JSON.stringify(messages)}`);
      },
      resume: () => child.send("resume"),
      async stop() {
        assert(child.kill("SIGTERM"), "expected live harness child");
        const exit = await exited;
        assert(!messages.some(message => message.counts));
        return exit;
      },
      async finish() {
        let timer;
        const exit = await Promise.race([exited, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Worker exit timed out")), 16_000);
        })]).finally(() => clearTimeout(timer));
        assert.equal(exit.code, 0);
        const result = messages.find(message => message.counts);
        assert(result);
        return { ...result, sqlstates: messages.filter(message => message.sqlstate).map(message => message.sqlstate) };
      },
    };
  }

  function cleanFixture() {
    if (!owner) return;
    if (receiptIds.length) {
      sql(`DELETE FROM public.study_notification_webhook_receipts WHERE provider_event_id IN (${receiptIds.map(q).join(",")});`);
      receiptIds.length = 0;
    }
    sql(`DELETE FROM auth.users WHERE id=${q(owner)};`);
    owner = undefined;
  }
  function fixture() {
    cleanFixture();
    owner = randomUUID();
    const task = randomUUID(), schedule = randomUUID(), study = randomUUID(), job = randomUUID();
    sql(`BEGIN;
      INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${q(owner)},${q(email)},clock_timestamp());
      SELECT set_config('request.jwt.claim.sub',${q(owner)},true);
      SELECT public.ls_set_study_notification_preferences(true);
      SELECT public.ls_set_study_reminder_locale('en');
      DO $fixture$ DECLARE st timestamptz:=date_trunc('milliseconds',clock_timestamp())+interval '5 minutes'; z text; d date;
      BEGIN
        z:=CASE WHEN extract(hour FROM st AT TIME ZONE 'UTC') BETWEEN 2 AND 20 THEN 'UTC' ELSE 'Etc/GMT+12' END;
        d:=(st AT TIME ZONE z)::date;
        INSERT INTO public.tasks(id,user_id,title,status) VALUES(${q(task)},${q(owner)},'10B recovery fixture','todo');
        INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
          VALUES(${q(schedule)},${q(owner)},${q(task)},d,d,z);
        INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,
          local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
          VALUES(${q(study)},${q(owner)},${q(task)},${q(schedule)},1,${q(study)},d,(st AT TIME ZONE z)::time,
            ((st+interval '30 minutes') AT TIME ZONE z)::time,z,st,st+interval '30 minutes');
        INSERT INTO public.study_notification_jobs(id,user_id,session_id,schedule_revision,due_at,next_attempt_at,idempotency_key,lifecycle_fingerprint)
          SELECT ${q(job)},user_id,${q(study)},1,due_at,due_at,${q(job)},fingerprint
          FROM public.ls_notification_session_policy(${q(study)});
      END $fixture$;
      UPDATE public.study_notification_dispatch_control SET enabled=true;
      COMMIT;`);
    return job;
  }
  const state = job => JSON.parse(sql(`SELECT json_build_object(
    'job',j.status,'attempts',j.attempt_count,'lease',j.lease_token IS NOT NULL,'cancelled',j.cancel_requested_at IS NOT NULL,
    'deliveries',(SELECT count(*) FROM public.study_notification_deliveries WHERE job_id=j.id),
    'delivery',(SELECT status FROM public.study_notification_deliveries WHERE job_id=j.id ORDER BY attempt_number DESC LIMIT 1),
    'payloads',(SELECT count(*) FROM public.study_notification_resend_payloads WHERE job_id=j.id),
    'tokens',(SELECT count(*) FROM public.study_notification_unsubscribe_tokens WHERE user_id=j.user_id),
    'consent',(SELECT study_email_enabled FROM public.study_notification_preferences WHERE user_id=j.user_id))
    FROM public.study_notification_jobs j WHERE id=${q(job)}`));
  const immutable = job => sql(`SELECT md5(to_jsonb(p)::text) FROM public.study_notification_resend_payloads p WHERE job_id=${q(job)}`);
  const expire = job => assert.equal(sql(`UPDATE public.study_notification_jobs SET lease_until=clock_timestamp()-interval '1 second'
    WHERE id=${q(job)} AND status='leased' RETURNING status`), "leased");
  const observe = async job => {
    const s = await rpc("ls_learning_schedule_operational_snapshot");
    assert.equal(s.missedSweep.enabled, false);
    return { state: state(job), snapshot: s };
  };
  const record = (name, before, after, calls, extra = {}) => {
    report.notificationCases.push({ case: name, before, after, fakeSubmissions: calls, ...extra });
    console.log(`PASS ${name}: ${calls} fake submission(s)`);
  };
  async function confirmAcceptance(job, messageId) {
    const facts = JSON.parse(sql(`SELECT json_build_object('p_delivery_id',id,'p_handoff_token',handoff_token,
      'p_payload_fingerprint',provider_payload_fingerprint) FROM public.study_notification_deliveries WHERE job_id=${q(job)}`));
    await rpc("ls_notification_record_resend_outcome", { ...facts, p_outcome: "accepted", p_message_id: messageId });
  }
  const optOut = job => sql(`SELECT public.ls_notification_consume_unsubscribe_token(token_hash)
    FROM public.study_notification_resend_payloads WHERE job_id=${q(job)}`);

  try {
    for (const [name, checkpoint, sends, stage] of [
      ["FR-01", "claim_committed", 1, null],
      ["FR-02", "payload_prepared", 1, null],
      ["FR-03", "handoff_committed", 0, "submitting"],
    ]) {
      const job = fixture(), start = observations.length;
      const child = spawnWorker(checkpoint);
      await child.barrier();
      const exit = await child.stop();
      const payload = immutable(job);
      expire(job);
      const before = await observe(job);
      assert.equal(before.state.delivery, stage);
      assert.equal(before.state.attempts, 1);
      assert.equal(before.snapshot.dispatch.expiredLeases, 1);
      assert.equal(observations.length, start);
      await spawnWorker().finish();
      const after = await observe(job);
      assert.equal(after.snapshot.dispatch.expiredLeases, 0);
      assert.equal(after.snapshot.dispatch.uncertainAttempts, sends ? 0 : 1);
      assert.equal(after.state.delivery, sends ? "accepted" : "uncertain");
      assert.equal(after.state.attempts, sends ? 2 : 1);
      assert.equal(after.state.tokens, 1);
      assert.equal(after.state.deliveries, 1);
      assert.equal(observations.length - start, sends);
      if (payload) assert.equal(immutable(job), payload);
      if (sends) assert.equal(observations.at(-1).key, job);
      record(name, before, after, sends, { checkpoint, processExit: exit, payloadPreserved: !!payload });
    }

    for (const name of ["FR-04", "FR-05"]) {
      const job = fixture(), start = observations.length;
      loseResponse = name === "FR-04";
      if (!loseResponse) sql(`CREATE FUNCTION public.ls_10b_fixture_rollback() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Fixture outcome rollback' USING ERRCODE='P0001'; END $$;
        CREATE TRIGGER ls_10b_fixture_rollback BEFORE UPDATE ON public.study_notification_deliveries
        FOR EACH ROW WHEN (NEW.status='accepted') EXECUTE FUNCTION public.ls_10b_fixture_rollback();`);
      let outcome;
      try { outcome = await spawnWorker().finish(); } finally {
        sql("DROP TRIGGER IF EXISTS ls_10b_fixture_rollback ON public.study_notification_deliveries; DROP FUNCTION IF EXISTS public.ls_10b_fixture_rollback();");
        loseResponse = false;
      }
      assert.equal(observations.length - start, 1);
      assert.equal(observations.at(-1).key, job);
      const payload = immutable(job);
      if (name === "FR-05") {
        assert.deepEqual(outcome.sqlstates, ["P0001"]);
        assert.equal(state(job).delivery, "submitting");
        expire(job);
      } else {
        assert.equal(outcome.counts.uncertain, 1);
      }
      const before = await observe(job);
      if (name === "FR-05") assert.equal(before.snapshot.dispatch.expiredLeases, 1);
      else assert.equal(before.snapshot.dispatch.uncertainAttempts, 1);
      await spawnWorker().finish();
      const held = await observe(job);
      assert.equal(held.state.delivery, "uncertain");
      assert.equal(held.snapshot.dispatch.uncertainAttempts, 1);
      assert.equal(held.snapshot.dispatch.expiredLeases, 0);
      assert.equal(observations.length - start, 1);
      await confirmAcceptance(job, observations.at(-1).messageId);
      const after = await observe(job);
      assert.equal(after.state.job, "sent");
      assert.equal(after.snapshot.dispatch.uncertainAttempts, 0);
      assert.equal(immutable(job), payload);
      record(name, before, after, 1, { held, outcome, payloadPreserved: true });
    }

    const job = fixture(), start = observations.length;
    const child = spawnWorker("provider_accepted");
    await child.barrier();
    const message = observations.at(-1).messageId;
    const fingerprint = sql(`SELECT recipient_fingerprint FROM public.study_notification_resend_payloads WHERE job_id=${q(job)}`);
    const event = (type, at) => {
      const id = `fr-${randomUUID()}`;
      receiptIds.push(id);
      return { p_event_id: id, p_message_id: message, p_event_type: type,
        p_event_at: at, p_recipient_fingerprint: fingerprint, p_payload_fingerprint: sha(type + at) };
    };
    const delivered = event("email.delivered", new Date().toISOString());
    assert.equal((await rpc("ls_notification_ingest_resend", delivered)).status, "unmatched");
    const uncorrelated = await observe(job);
    assert.equal(uncorrelated.snapshot.dispatch.unmatchedWebhooks, 1);
    child.resume();
    await child.finish();
    const correlated = await observe(job);
    assert.equal(correlated.state.delivery, "delivered");
    assert.equal(correlated.snapshot.dispatch.unmatchedWebhooks, 0);
    assert.equal(observations.length - start, 1);
    record("FR-06", uncorrelated, correlated, 1);
    assert.equal((await rpc("ls_notification_ingest_resend", delivered)).replay, true);
    await rpc("ls_notification_ingest_resend", event("email.sent", new Date(Date.parse(delivered.p_event_at) - 1000).toISOString()));
    const ordered = await observe(job);
    assert.equal(ordered.state.delivery, "delivered");
    assert.equal(ordered.snapshot.dispatch.unmatchedWebhooks, 0);
    assert.equal(sql("SELECT count(*) FROM public.study_notification_webhook_receipts"), "2");
    record("FR-07", correlated, ordered, 0, { receipts: 2 });

    for (const [checkpoint, allowed] of [["before_handoff", false], ["handoff_committed", true]]) {
      const j = fixture(), initial = observations.length;
      const w = spawnWorker(checkpoint);
      await w.barrier();
      const before = await observe(j);
      assert.equal(optOut(j), "t");
      w.resume();
      await w.finish();
      const after = await observe(j);
      assert.equal(after.state.consent, false);
      assert.equal(after.state.delivery, allowed ? "accepted" : null);
      assert.equal(after.state.cancelled, true);
      assert.equal(observations.length - initial, allowed ? 1 : 0);
      record("FR-08", before, after, allowed ? 1 : 0, { checkpoint });
    }

    const first = fixture();
    assert.equal((await spawnWorker().finish()).counts.accepted, 1);
    assert.equal((await observe(first)).state.job, "sent");
    const next = fixture(), initial = observations.length, on = await observe(next);
    sql("UPDATE public.study_notification_dispatch_control SET enabled=false");
    assert.equal((await spawnWorker().finish()).counts.inspected, 0);
    const off = await observe(next);
    assert.equal(off.snapshot.dispatch.enabled, false);
    assert.equal(off.state.attempts, 0);
    assert.equal(observations.length, initial);
    record("FR-09", on, off, 0);

    const locked = fixture(), initialLocked = observations.length;
    const prepared = spawnWorker("payload_prepared");
    await prepared.barrier();
    const exit = await prepared.stop();
    const original = immutable(locked);
    expire(locked);
    const before = await observe(locked);
    assert.equal((await spawnWorker(undefined, true).finish()).counts.held, 1);
    const blocked = await observe(locked);
    assert.equal(blocked.state.delivery, null);
    assert.equal(blocked.state.attempts, 2);
    assert.equal(blocked.state.tokens, 1);
    assert.equal(observations.length, initialLocked);
    assert.equal(immutable(locked), original);
    expire(locked);
    assert.equal((await spawnWorker().finish()).counts.accepted, 1);
    const recovered = await observe(locked);
    assert.equal(recovered.state.attempts, 3);
    assert.equal(recovered.state.tokens, 1);
    assert.equal(immutable(locked), original);
    assert.equal(observations.length - initialLocked, 1);
    assert.equal(observations.at(-1).key, locked);
    record("FR-10", before, recovered, 1, { blocked, processExit: exit, payloadPreserved: true });
  } finally {
    await Promise.all([...running].map(async child => {
      const exit = once(child, "exit");
      child.kill("SIGTERM");
      await exit;
    }));
    fake.closeAllConnections();
    await new Promise(done => fake.close(done));
    sql(`UPDATE public.study_notification_dispatch_control SET enabled=false;
      DROP TRIGGER IF EXISTS ls_10b_fixture_rollback ON public.study_notification_deliveries;
      DROP FUNCTION IF EXISTS public.ls_10b_fixture_rollback();`);
    cleanFixture();
    report.final = counts();
    report.cleanup = Object.values(report.final).every(value => value === 0 || value === false);
    report.fakeSubmissions = observations.length;
    report.finishedAt = new Date().toISOString();
    await writeFile(resolve(root, "docs/learning-schedule/phase-10-recovery.json"), JSON.stringify(report, null, 2) + "\n");
    assert(report.cleanup);
  }
}
