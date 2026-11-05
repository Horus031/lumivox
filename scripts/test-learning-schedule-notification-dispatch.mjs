
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const container = "supabase_db_lumivox-proj";
const owner = randomUUID();
// LOCAL ONLY: disposable, uniquely owned fixtures; no provider or network SDK.
const email = `notification-dispatch-${owner}@example.invalid`;
const title = "Notification dispatch verification fixture";

const reportPath = resolve(
  root,
  "docs/learning-schedule/phase-07-notification-dispatch.json",
);

const q = value =>
  `'${String(value).replaceAll("'", "''")}'`;

const wait = ms =>
  new Promise(resolveWait => setTimeout(resolveWait, ms));

class Connection {
  constructor(name) {
    this.name = name;
    this.active = null;
    this.stderr = [];
    this.closed = false;

    this.child = spawn(
      "docker",
      [
        "exec", "-i", container,
        "psql", "-X", "-A", "-t", "-q",
        "-U", "postgres", "-d", "postgres",
      ],
      {
        cwd: root,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    createInterface({ input: this.child.stdout })
      .on("line", line => {
        if (!this.active) return;

        if (line === this.active.marker) {
          const pending = this.active;
          this.active = null;
          clearTimeout(pending.timer);

          pending.resolve({
            text: pending.lines.join("\n"),
            errors: this.stderr.splice(0),
          });
        } else {
          this.active.lines.push(line);
        }
      });

    createInterface({ input: this.child.stderr })
      .on("line", line => this.stderr.push(line));

    this.child.on("error", error => this.fail(error));

    this.child.on("exit", code => {
      if (!this.closed) {
        this.fail(
          new Error(`${name}: psql exited with code ${code}`),
        );
      }
    });
  }

  fail(error) {
    if (!this.active) return;

    const pending = this.active;
    this.active = null;
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  exec(sql) {
    assert(!this.active, `${this.name}: command already active`);

    return new Promise((resolveCommand, reject) => {
      const marker =
        `__LS_DONE_${randomUUID().replaceAll("-", "")}`;

      const timer = setTimeout(() => {
        this.fail(
          new Error(`${this.name}: command exceeded 15 seconds`),
        );
      }, 15000);

      this.active = {
        marker,
        timer,
        lines: [],
        resolve: resolveCommand,
        reject,
      };

      this.stderr.length = 0;

      this.child.stdin.write(
        `${sql}\n` +
        "\\echo __LS_SQLSTATE :SQLSTATE\n" +
        "\\echo __LS_LAST_ERROR :LAST_ERROR_MESSAGE\n" +
        `\\echo ${marker}\n`,
      );
    }).then(result => {
      const lines = result.text.split("\n");

      const state = lines
        .findLast(x => x.startsWith("__LS_SQLSTATE "))
        ?.split(" ")[1];

      const message = lines
        .findLast(x => x.startsWith("__LS_LAST_ERROR "))
        ?.slice("__LS_LAST_ERROR ".length);

      return {
        state,
        message: state === "00000" ? null : message,
        text: lines.filter(
          x => !x.startsWith("__LS_SQLSTATE ") &&
               !x.startsWith("__LS_LAST_ERROR "),
        ).join("\n").trim(),
        errors: result.errors,
      };
    });
  }

  async ok(sql) {
    const result = await this.exec(sql);

    assert.equal(
      result.state,
      "00000",
      `${this.name}: ${result.state}: ` +
        `${result.message ?? ""}\n${result.errors.join("\n")}`,
    );

    return result.text;
  }

  async json(sql) {
    return JSON.parse(await this.ok(sql));
  }

  async init() {
    await this.ok(`
      \\set ON_ERROR_STOP off
      \\set VERBOSITY verbose
      SET application_name =
        ${q(`lumivox-notification-dispatch-${this.name}`)};
      SET lock_timeout = '5s';
      SET statement_timeout = '10s';
    `);

    this.pid = Number(
      await this.ok("SELECT pg_backend_pid();"),
    );
  }

  async begin(role = "authenticated") {
    assert(
      ["authenticated", "service_role"].includes(role),
      "Unexpected test role",
    );

    await this.ok(`
      BEGIN;
      SET LOCAL ROLE ${role};
      ${role === "authenticated" ? `
        SET LOCAL "request.jwt.claim.sub" = ${q(owner)};
        SET LOCAL "request.jwt.claim.role" = 'authenticated';
      ` : ""}
    `);
  }

  async close() {
    if (this.closed) return;

    this.closed = true;

    if (this.active) {
      this.fail(new Error(`${this.name}: closing active command`));
    }

    this.child.stdin.end("ROLLBACK;\n\\q\n");

    await Promise.race([
      new Promise(done => this.child.once("exit", done)),
      wait(2000),
    ]);

    if (this.child.exitCode === null) {
      this.child.kill();
    }
  }
}

// Node 22: run with --experimental-strip-types. These are the actual TS fake
// provider/dispatcher modules used by unit tests, not a duplicate mock worker.
const { FakeReminderProvider } = await import('../apps/web/features/learning-schedule/notifications/fake-reminder-provider.ts');
const { dispatchFakeReminderBatch, assertLocalReminderTarget } = await import('../apps/web/features/learning-schedule/notifications/fake-reminder-dispatcher.ts');
const local = process.env.LEARNING_SCHEDULE_DISPATCH_TEST_URL ?? 'http://127.0.0.1:55321';
assertLocalReminderTarget(local); // refuse remote input before creating connections
let a = new Connection('A');
const b = new Connection('B'), observer = new Connection('observer');
const report = {
  baseline: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  startedAt: new Date().toISOString(), container, localTarget: local, runs: [],
  handoffBoundary: 'authorization transaction COMMIT, before provider call; post-handoff cancellation cannot recall accepted submission',
};
let calls = 0, accepted = 0, canChangeGate = false;

async function transaction(connection, sql) {
  await connection.begin('service_role');
  try {
    const result = await connection.json(sql);
    await connection.ok('COMMIT;');
    return result;
  } catch (error) {
    await connection.ok('ROLLBACK;');
    throw error;
  }
}
const claim = (connection, size = 25) => transaction(connection, `SELECT public.ls_notification_claim_batch(${size});`);
const authorize = (connection, c) => transaction(connection,
  `SELECT public.ls_notification_authorize_attempt(${q(c.jobId)},${q(c.leaseToken)});`);
const record = (connection, c, outcome) => transaction(connection,
  `SELECT public.ls_notification_record_fake_outcome(${q(c.jobId)},${q(c.leaseToken)},${q(JSON.stringify(outcome))}::jsonb);`);
const store = (connection, existing) => ({
  claim: () => existing ? Promise.resolve(existing) : claim(connection),
  authorize: c => authorize(connection, c),
  record: (c, outcome) => record(connection, c, outcome),
});
const acceptedProvider = () => new FakeReminderProvider(() => {
  calls++; accepted++; return { kind: 'accepted', messageId: `fake-${randomUUID()}` };
});
function barrier() {
  let release, reached;
  const waiting = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { reached = resolve; });
  const timer = setTimeout(() => release(), 4000);
  return { entered, stop: () => { clearTimeout(timer); release(); },
    async hold() { reached(); await waiting; } };
}

async function setup(count = 1) {
  await observer.ok(`DELETE FROM public.tasks WHERE user_id=${q(owner)} AND title=${q(title)};
    DELETE FROM public.study_notification_task_overrides WHERE user_id=${q(owner)};
    INSERT INTO public.study_notification_preferences(user_id,study_email_enabled,consented_at)
      VALUES(${q(owner)},true,clock_timestamp()) ON CONFLICT(user_id) DO UPDATE
      SET study_email_enabled=true,consented_at=clock_timestamp(),quiet_hours_enabled=false;`);
  const fixtures = [];
  for (let i = 0; i < count; i++) {
    const task = randomUUID(), schedule = randomUUID(), session = randomUUID(), job = randomUUID();
    await observer.ok(`
      INSERT INTO public.tasks(id,user_id,title,status) VALUES(${q(task)},${q(owner)},${q(title)},'todo');
      INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
        VALUES(${q(schedule)},${q(owner)},${q(task)},'2020-01-01','2040-01-01','UTC');
      WITH timing AS (SELECT date_trunc('milliseconds',clock_timestamp())+interval '5 minutes' starts,
        CASE WHEN extract(hour FROM clock_timestamp() AT TIME ZONE 'UTC') BETWEEN 2 AND 20 THEN 'UTC' ELSE 'Etc/GMT+12' END z)
      INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,
        local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
      SELECT ${q(session)},${q(owner)},${q(task)},${q(schedule)},1,${q(session)},
        (starts AT TIME ZONE z)::date,(starts AT TIME ZONE z)::time,
        ((starts+interval '1 minute') AT TIME ZONE z)::time,z,starts,starts+interval '1 minute' FROM timing;
      INSERT INTO public.study_notification_jobs(id,user_id,session_id,schedule_revision,due_at,next_attempt_at,idempotency_key,lifecycle_fingerprint)
        SELECT ${q(job)},user_id,${q(session)},1,due_at,due_at,'dispatch-test:'||${q(session)},fingerprint
        FROM public.ls_notification_session_policy(${q(session)});
    `);
    fixtures.push({ task, schedule, session, job });
  }
  return fixtures;
}
async function state() {
  return observer.json(`SELECT json_build_object(
    'jobs',coalesce((SELECT json_agg(json_build_object('id',id,'status',status,'claims',attempt_count,
      'cancelled',cancel_requested_at IS NOT NULL,'leased',lease_token IS NOT NULL) ORDER BY id)
      FROM public.study_notification_jobs WHERE user_id=${q(owner)}),'[]'),
    'deliveries',coalesce((SELECT json_agg(json_build_object('status',status,'attempt',attempt_number) ORDER BY attempt_number)
      FROM public.study_notification_deliveries WHERE user_id=${q(owner)}),'[]'));`);
}
async function blocked(waiter, blocker) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const pids = await observer.json(`SELECT to_json(pg_blocking_pids(${waiter.pid}));`);
    if (pids.includes(blocker.pid)) return { waiter: waiter.pid, blocker: blocker.pid, observed: pids };
    await wait(20);
  }
  throw new Error('Expected database blocker was not observed');
}
async function expireLeases() {
  // Controlled fixture expiry, not a production clock override/60-second sleep.
  await observer.ok(`UPDATE public.study_notification_jobs SET lease_until=clock_timestamp()-interval '1 second'
    WHERE user_id=${q(owner)} AND status='leased';`);
  return transaction(b, 'SELECT public.ls_notification_reconcile_expired_leases();');
}
async function restartA() {
  await a.close();
  a = new Connection('A-restarted');
  await a.init();
}

try {
  await Promise.all([a.init(), b.init(), observer.init()]);
  const initial = await observer.json(`SELECT json_build_object('database',current_database(),
    'users',(SELECT count(*) FROM auth.users),'tasks',(SELECT count(*) FROM public.tasks),
    'jobs',(SELECT count(*) FROM public.study_notification_jobs),
    'dispatch',(SELECT enabled FROM public.study_notification_dispatch_control),
    'sweep',(SELECT enabled FROM public.ls_missed_sweep_control));`);
  assert.deepEqual(initial, { database: 'postgres', users: 0, tasks: 0, jobs: 0, dispatch: false, sweep: false },
    'Refuse gate changes unless local database is disposable/empty');
  report.initial = initial; canChangeGate = true;
  await observer.ok(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${q(owner)},${q(email)},clock_timestamp());
    INSERT INTO public.profiles(id) VALUES(${q(owner)}) ON CONFLICT DO NOTHING;`);

  await setup();
  assert.deepEqual(await dispatchFakeReminderBatch(local, store(a), acceptedProvider()), { claimed: 0, submissions: 0 });
  assert.equal(calls, 0);
  report.runs.push({ case: 'ND-01 gate OFF', providerCalls: 0, final: await state() });
  await observer.ok('UPDATE public.study_notification_dispatch_control SET enabled=true;');

  for (let repeat = 1; repeat <= 3; repeat++) {
    await setup(2);
    await a.begin('service_role');
    const first = await a.json('SELECT public.ls_notification_claim_batch(1);');
    assert.equal(first.length, 1);
    const start = performance.now();
    const skipped = await claim(b, 1);
    const elapsedMs = performance.now() - start;
    assert.deepEqual(skipped, []); assert(elapsedMs < 1500, 'Owner gate must skip, not wait');
    await a.ok('COMMIT;');
    const second = await claim(b, 1);
    assert.equal(second.length, 1); assert.notEqual(first[0].jobId, second[0].jobId);
    await Promise.all([
      dispatchFakeReminderBatch(local, store(a, first), acceptedProvider()),
      dispatchFakeReminderBatch(local, store(b, second), acceptedProvider()),
    ]);
    const claimedFinal = await state(); assert(claimedFinal.jobs.every(j => j.status === 'sent'));
    assert.equal(claimedFinal.deliveries.length, 2);
    report.runs.push({ case: 'ND-03 concurrent claimers', repeat, elapsedMs,
      firstJobIds: first.map(c => c.jobId), secondJobIds: second.map(c => c.jobId), final: claimedFinal });

    const [fixture] = await setup(2);
    await observer.ok(`BEGIN; SELECT id FROM public.study_notification_jobs WHERE id=${q(fixture.job)} FOR UPDATE;`);
    const skipStart = performance.now();
    const other = await claim(a);
    const skipMs = performance.now() - skipStart;
    assert.equal(other.length, 1); assert.notEqual(other[0].jobId, fixture.job); assert(skipMs < 1500);
    await observer.ok('ROLLBACK;');
    const retry = await claim(b); assert.equal(retry.length, 1); assert.equal(retry[0].jobId, fixture.job);
    report.runs.push({ case: 'ND-03 real Job SKIP LOCKED', repeat, elapsedMs: skipMs, retrySucceeded: true });

    for (const cancel of ['global-opt-out', 'task-disable']) {
      const [f] = await setup();
      const leased = await claim(a);
      await b.begin();
      await b.ok(cancel === 'global-opt-out'
        ? 'SELECT public.ls_set_study_notification_preferences(false);'
        : `SELECT public.ls_set_study_notification_task_override(${q(f.task)},false);`);
      const before = calls;
      const pending = dispatchFakeReminderBatch(local, store(a, leased), acceptedProvider());
      const blocker = await blocked(a, b);
      await b.ok('COMMIT;');
      const result = await pending;
      assert.equal(result.submissions, 0); assert.equal(calls, before);
      const final = await state(); assert.equal(final.jobs[0].status, 'suppressed'); assert.equal(final.deliveries.length, 0);
      report.runs.push({ case: 'ND-05/16 cancellation before handoff', cancel, repeat, blocker, result, final });
    }

    await setup();
    const quietClaim = await claim(a);
    await b.begin();
    await b.ok(`SELECT public.ls_set_study_notification_preferences(true,15,true,
      ((clock_timestamp() AT TIME ZONE 'UTC')-interval '1 minute')::time,
      ((clock_timestamp() AT TIME ZONE 'UTC')+interval '1 minute')::time,'UTC');`);
    const beforeQuiet = calls;
    const quietPending = dispatchFakeReminderBatch(local, store(a, quietClaim), acceptedProvider());
    const quietBlocker = await blocked(a, b);
    await b.ok('COMMIT;');
    const quietResult = await quietPending;
    assert.equal(quietResult.submissions, 0); assert.equal(calls, beforeQuiet);
    assert.equal((await state()).jobs[0].status, 'suppressed');
    report.runs.push({ case: 'ND-11 concurrent quiet-hours-only save', repeat, blocker: quietBlocker, result: quietResult });

    await setup();
    const hold = barrier();
    const before = calls;
    const paused = new FakeReminderProvider(async () => {
      calls++; await hold.hold(); accepted++; return { kind: 'accepted', messageId: `fake-${randomUUID()}` };
    });
    const inFlight = dispatchFakeReminderBatch(local, store(a), paused);
    await hold.entered;
    const durable = await state(); assert.equal(durable.deliveries[0].status, 'submitting');
    const cancelStart = performance.now();
    await b.begin(); await b.ok('SELECT public.ls_set_study_notification_preferences(false);'); await b.ok('COMMIT;');
    const cancelMs = performance.now() - cancelStart; assert(cancelMs < 1500, 'No database transaction held through provider barrier');
    hold.stop(); await inFlight;
    const final = await state(); assert.equal(calls - before, 1); assert.equal(final.jobs[0].status, 'sent');
    assert.equal(final.jobs[0].cancelled, true); assert.equal(final.deliveries[0].status, 'accepted');
    report.runs.push({ case: 'ND-16 cancellation AFTER durable handoff', repeat, cancelMs, final,
      limitation: 'Provider accepted after opt-out commit; handoff already authorized. No recall guarantee.' });

    await setup();
    const lostBarrier = barrier();
    const lost = dispatchFakeReminderBatch(local, store(a), new FakeReminderProvider(async () => {
      calls++; accepted++; await lostBarrier.hold(); return { kind: 'uncertain', code: 'response_lost' };
    }));
    await lostBarrier.entered;
    assert.equal((await state()).deliveries[0].status, 'submitting');
    lostBarrier.stop(); await lost;
    const callsAfterLost = calls;
    await dispatchFakeReminderBatch(local, store(b), acceptedProvider());
    assert.equal(calls, callsAfterLost);
    const uncertain = await state(); assert.equal(uncertain.jobs[0].status, 'failed'); assert.equal(uncertain.deliveries[0].status, 'uncertain');
    report.runs.push({ case: 'ND-08 accepted response lost', repeat, noBlindRetry: true, final: uncertain });
  }

  await setup();
  const [authClaim] = await claim(a);
  await observer.ok(`BEGIN; UPDATE auth.users SET email_confirmed_at=NULL WHERE id=${q(owner)};`);
  await a.begin('service_role');
  const authConflict = await a.exec(`SELECT public.ls_notification_authorize_attempt(${q(authClaim.jobId)},${q(authClaim.leaseToken)});`);
  assert.equal(authConflict.state, '55P03');
  await a.ok('ROLLBACK;');
  await observer.ok('COMMIT;');
  const unverifiedRetry = await authorize(a, authClaim);
  assert.equal(unverifiedRetry.authorized, false); assert.equal(unverifiedRetry.reason, 'unverified_destination');
  assert.equal((await state()).deliveries.length, 0);
  report.runs.push({ case: 'ND-12 Auth verification update contention', sqlstate: authConflict.state, retry: unverifiedRetry });
  await observer.ok(`UPDATE auth.users SET email_confirmed_at=clock_timestamp() WHERE id=${q(owner)};`);

  await setup();
  await claim(a);
  await restartA(); // claim committed; process disappears before any handoff
  assert.equal(await expireLeases(), 1);
  const recovered = await dispatchFakeReminderBatch(local, store(b), acceptedProvider());
  assert.equal(recovered.submissions, 1);
  let final = await state(); assert.equal(final.jobs[0].claims, 2); assert.equal(final.deliveries.length, 1);
  report.runs.push({ case: 'ND-09/19 restart before handoff', final });

  await setup();
  const [crashed] = await claim(a); assert.equal((await authorize(a, crashed)).authorized, true);
  const beforeCrash = calls;
  await restartA(); // durable submitting committed, but no provider result exists
  assert.equal(await expireLeases(), 1);
  await dispatchFakeReminderBatch(local, store(b), acceptedProvider());
  assert.equal(calls, beforeCrash);
  final = await state(); assert.equal(final.jobs[0].status, 'failed'); assert.equal(final.deliveries[0].status, 'uncertain');
  report.runs.push({ case: 'ND-10/19 restart after handoff', noBlindRetry: true, final });

  await setup();
  await observer.ok(`CREATE FUNCTION public.nd_test_outcome_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
    BEGIN IF NEW.user_id=${q(owner)}::uuid AND NEW.status='sent' THEN RAISE EXCEPTION 'injected outcome commit failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER nd_test_outcome_fault BEFORE UPDATE ON public.study_notification_jobs FOR EACH ROW EXECUTE FUNCTION public.nd_test_outcome_fault();`);
  const beforeFault = calls;
  await assert.rejects(dispatchFakeReminderBatch(local, store(a), acceptedProvider()), /P0001/);
  assert.equal(calls - beforeFault, 1); assert.equal((await state()).deliveries[0].status, 'submitting');
  await observer.ok('DROP TRIGGER nd_test_outcome_fault ON public.study_notification_jobs; DROP FUNCTION public.nd_test_outcome_fault();');
  await restartA(); await expireLeases();
  await dispatchFakeReminderBatch(local, store(b), acceptedProvider()); assert.equal(calls - beforeFault, 1);
  report.runs.push({ case: 'ND-19 accepted but outcome transaction failed', sqlstate: 'P0001', noBlindRetry: true, final: await state() });
  report.providerCalls = calls; report.fakeAcceptances = accepted; report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL'; report.error = String(error.stack ?? error); process.exitCode = 1;
} finally {
  await Promise.all([a.close(), b.close()]);
  try {
    await observer.ok('ROLLBACK;');
    if (canChangeGate) {
      await observer.ok(`UPDATE public.study_notification_dispatch_control SET enabled=false;
        DROP TRIGGER IF EXISTS nd_test_outcome_fault ON public.study_notification_jobs;
        DROP FUNCTION IF EXISTS public.nd_test_outcome_fault();
        DELETE FROM public.tasks WHERE user_id=${q(owner)} AND title=${q(title)};
        DELETE FROM auth.users WHERE id=${q(owner)} AND email=${q(email)};`);
      report.cleanup = await observer.json(`SELECT json_build_object('users',(SELECT count(*) FROM auth.users WHERE id=${q(owner)}),
        'tasks',(SELECT count(*) FROM public.tasks WHERE user_id=${q(owner)}),'jobs',(SELECT count(*) FROM public.study_notification_jobs WHERE user_id=${q(owner)}),
        'deliveries',(SELECT count(*) FROM public.study_notification_deliveries WHERE user_id=${q(owner)}),
        'dispatch',(SELECT enabled FROM public.study_notification_dispatch_control),'sweep',(SELECT enabled FROM public.ls_missed_sweep_control));`);
      assert.deepEqual(report.cleanup, { users: 0, tasks: 0, jobs: 0, deliveries: 0, dispatch: false, sweep: false });
    }
  } catch (error) { report.cleanupError = String(error); report.result = 'FAIL'; process.exitCode = 1; }
  await observer.close(); report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

