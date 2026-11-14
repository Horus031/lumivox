import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, readFile } from "node:fs/promises";
import { loadReminderRuntime } from "./lib/load-learning-schedule-runtime.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const crashRecovery = process.argv.includes("--crash-recovery");
const multiworker = process.argv.includes("--multiworker");
assert(!(crashRecovery && multiworker), "Select one checkpoint mode");
const project = multiworker ? "lumivox-11c5d" : crashRecovery ? "lumivox-11c5c" : "lumivox-proj";
const isolated = crashRecovery || multiworker;
const container = `supabase_db_${project}`;
const owner = randomUUID();
const secondOwner = randomUUID();
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
// LOCAL ONLY. Actual repository worker/store/SDK adapter, injected mock SDK send;
// three real PostgreSQL connections + local PostgREST. Never a real API client.
class Connection {
  constructor(name) {
    this.name = name;
    this.active = null;
    this.stderr = [];
    this.closed = false;

    this.child = spawn(
      "docker",
      ["exec", "-i", container, "psql", "-X", "-A", "-t", "-q", "-U", "postgres", "-d", "postgres"],
      {
        cwd: root,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    createInterface({ input: this.child.stdout }).on("line", (line) => {
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

    createInterface({ input: this.child.stderr }).on("line", (line) => this.stderr.push(line));

    this.child.on("error", (error) => this.fail(error));

    this.child.on("exit", (code) => {
      if (!this.closed) {
        this.fail(new Error(`${name}: psql exited with code ${code}`));
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
      const marker = `__LS_DONE_${randomUUID().replaceAll("-", "")}`;

      const timer = setTimeout(() => {
        this.fail(new Error(`${this.name}: command exceeded 15 seconds`));
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
    }).then((result) => {
      const lines = result.text.split("\n");

      const state = lines.findLast((x) => x.startsWith("__LS_SQLSTATE "))?.split(" ")[1];

      const message = lines
        .findLast((x) => x.startsWith("__LS_LAST_ERROR "))
        ?.slice("__LS_LAST_ERROR ".length);

      return {
        state,
        message: state === "00000" ? null : message,
        text: lines
          .filter((x) => !x.startsWith("__LS_SQLSTATE ") && !x.startsWith("__LS_LAST_ERROR "))
          .join("\n")
          .trim(),
        errors: result.errors,
      };
    });
  }

  async ok(sql) {
    const result = await this.exec(sql);

    assert.equal(
      result.state,
      "00000",
      `${this.name}: ${result.state}: ` + `${result.message ?? ""}\n${result.errors.join("\n")}`,
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
        ${q(`lumivox-notification-cc-${this.name}`)};
      SET lock_timeout = '5s';
      SET statement_timeout = '10s';
    `);

    this.pid = Number(await this.ok("SELECT pg_backend_pid();"));
  }

  async begin(role = "authenticated") {
    assert(["authenticated", "service_role"].includes(role), "Unexpected test role");

    await this.ok(`
      BEGIN;
      SET LOCAL ROLE ${role};
      ${
        role === "authenticated"
          ? `
        SET LOCAL "request.jwt.claim.sub" = ${q(owner)};
        SET LOCAL "request.jwt.claim.role" = 'authenticated';
      `
          : ""
      }
    `);
  }

  async close() {
    if (this.closed) return;

    this.closed = true;

    if (this.active) {
      this.fail(new Error(`${this.name}: closing active command`));
    }

    this.child.stdin.end("ROLLBACK;\n\\q\n");

    await Promise.race([new Promise((done) => this.child.once("exit", done)), wait(2000)]);

    if (this.child.exitCode === null) {
      this.child.kill();
    }
  }
}

const runtime = await loadReminderRuntime(root);
const require = createRequire(resolve(root, "apps/web/package.json")),
  { createClient } = require("@supabase/supabase-js");
const cli =
  process.env.SUPABASE_CLI_PATH ??
  "C:\\Users\\Dell\\AppData\\Local\\npm-cache\\_npx\\aa8e5c70f9d8d161\\node_modules\\@supabase\\cli-windows-x64\\bin\\supabase.exe";
const cliArgs = ["status", "--output", "json"];
if (isolated) {
  const workdir = process.env.LUMIVOX_RESEND_TEST_WORKDIR;
  assert(workdir, `Set LUMIVOX_RESEND_TEST_WORKDIR to the disposable ${project} stack`);
  const localConfig = await readFile(resolve(workdir, "supabase/config.toml"), "utf8");
  assert.equal(localConfig.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1], project);
  cliArgs.push("--workdir", workdir);
}
const status = JSON.parse(
  execFileSync(cli, cliArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
);
assert.equal(status.API_URL, isolated ? "http://127.0.0.1:56321" : "http://127.0.0.1:55321");
if (isolated) {
  const dbUrl = new URL(status.DB_URL);
  assert.equal(dbUrl.hostname, "127.0.0.1");
  assert.equal(dbUrl.port, "56322");
}
const makeStore = () =>
  runtime.store.createResendDispatchStore(
    createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  );
const [a, b, observer] = ["8d-A", "8d-B", "8d-observer"].map((name) => new Connection(name));
const email = "WorkerCase@example.invalid";
const secondEmail = "SecondWorkerCase@example.invalid";
const config = {
  enabled: true,
  allowlist: runtime.resolver.configuredReminderRecipients(email),
  identityKey: randomBytes(32).toString("hex"),
  encryptionKey: randomBytes(32),
  from: "Lumivox <study@example.invalid>",
  trustedOrigin: "https://app.lumivox.test",
};
const report = {
  baseline: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  startedAt: new Date().toISOString(),
  workerSourceSha256: createHash("sha256")
    .update(
      await readFile(
        resolve(
          root,
          "apps/web/features/learning-schedule/notifications/resend-reminder-dispatcher.ts",
        ),
      ),
    )
    .digest("hex"),
  runs: [],
  cleanup: false,
  realProviderRequests: 0,
};
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function deadline(promise) {
  return Promise.race([
    promise,
    wait(5000).then(() => {
      throw new Error("Controlled barrier deadline");
    }),
  ]);
}
async function fixture(locale = "en", userId = owner) {
  const owner = userId;
  await observer.ok(`DELETE FROM public.study_notification_suppressions WHERE user_id=${q(owner)};
 DELETE FROM public.tasks WHERE user_id=${q(owner)} AND title='8D fixture';
 DELETE FROM public.study_notification_unsubscribe_tokens WHERE user_id=${q(owner)};
 DELETE FROM public.study_notification_recipient_identities WHERE user_id=${q(owner)};
 UPDATE auth.users SET email_confirmed_at=clock_timestamp() WHERE id=${q(owner)};
 SELECT set_config('request.jwt.claim.sub',${q(owner)},false);SELECT public.ls_set_study_notification_preferences(true);SELECT public.ls_set_study_reminder_locale(${q(locale)});`);
  const task = randomUUID(),
    sc = randomUUID(),
    session = randomUUID(),
    job = randomUUID();
  await observer.ok(`DO $fixture$ DECLARE st timestamptz:=date_trunc('milliseconds',clock_timestamp())+interval '5 minutes';z text;day date;BEGIN
 z:=CASE WHEN extract(hour FROM clock_timestamp() AT TIME ZONE 'UTC') BETWEEN 2 AND 20 THEN 'UTC' ELSE 'Etc/GMT+12' END;day:=(st AT TIME ZONE z)::date;
 INSERT INTO public.tasks(id,user_id,title,status) VALUES(${q(task)},${q(owner)},'8D fixture','todo');
 INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone) VALUES(${q(sc)},${q(owner)},${q(task)},day,day,z);
 INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
 VALUES(${q(session)},${q(owner)},${q(task)},${q(sc)},1,${q(session)},day,(st AT TIME ZONE z)::time,((st+interval '30 minutes') AT TIME ZONE z)::time,z,st,st+interval '30 minutes');
 INSERT INTO public.study_notification_jobs(id,user_id,session_id,schedule_revision,due_at,next_attempt_at,idempotency_key,lifecycle_fingerprint)
 SELECT ${q(job)},user_id,${q(session)},1,due_at,due_at,${q(job)},fingerprint FROM public.ls_notification_session_policy(${q(session)});END $fixture$;`);
  return { job };
}
let calls = [];
let sdkCalls = 0;
function transport(mode = "accepted", callback) {
  // Execute the actual SDK adapter; only the SDK emails.send port is replaced.
  return {
    send: async (payload) => {
      calls.push({
        fingerprint: runtime.payload.reminderPayloadFingerprint(
          runtime.payload.serializeReminderPayload(payload),
        ),
        key: payload.idempotencyKey,
      });
      assert.equal(new URL(payload.unsubscribeUrl).pathname, "/api/study-reminders/unsubscribe");
      const send = async (request, options) => {
        sdkCalls++;
        assert.equal(options.idempotencyKey, payload.idempotencyKey);
        assert.deepEqual(Object.keys(request.headers).sort(), [
          "List-Unsubscribe",
          "List-Unsubscribe-Post",
        ]);
        assert.equal(request.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
        if (callback) await callback();
        if (mode === "timeout") throw new Error("controlled timeout");
        if (mode === "409")
          return { data: null, error: { name: "concurrent_idempotent_requests", statusCode: 409 } };
        if (mode === "429")
          return { data: null, error: { name: "rate_limit_exceeded", statusCode: 429 } };
        return { data: { id: randomUUID() }, error: null };
      };
      const { ResendReminderProvider } = await import(
        new URL("../apps/web/.next/step-8d-runtime/resend-reminder-provider.mjs", import.meta.url)
      );
      return new ResendReminderProvider({ emails: { send } }, config.from).send(payload);
    },
  };
}
async function snapshot(job) {
  return observer.json(
    `SELECT to_jsonb(p) FROM public.study_notification_resend_payloads p WHERE job_id=${q(job)};`,
  );
}
async function final(job) {
  return observer.json(`SELECT json_build_object('job',j.status,'cancelled',j.cancel_requested_at IS NOT NULL,
 'consent',(SELECT study_email_enabled FROM public.study_notification_preferences WHERE user_id=${q(owner)}),
 'deliveries',(SELECT count(*) FROM public.study_notification_deliveries WHERE job_id=j.id),
 'delivery',(SELECT status FROM public.study_notification_deliveries WHERE job_id=j.id ORDER BY attempt_number DESC LIMIT 1)) FROM public.study_notification_jobs j WHERE id=${q(job)};`);
}
async function claim(f) {
  const claims = await makeStore().claim(1);
  const c = claims.find((x) => x.jobId === f.job);
  assert(c);
  return c;
}
async function blocked(waiter, blocker) {
  const end = Date.now() + 3000;
  while (Date.now() < end) {
    const pids = await observer.json(`SELECT to_json(pg_blocking_pids(${waiter.pid}));`);
    if (pids.includes(blocker.pid))
      return { waiter: waiter.pid, blocker: blocker.pid, observed: pids };
    await wait(20);
  }
  throw new Error("Expected blocker not observed");
}
const prepareSql = (c, x, input) =>
  `SELECT public.ls_notification_prepare_resend_payload(${q(c.jobId)},${q(c.leaseToken)},${q(x.contextHash)},${q(x.recipient)},${q(x.recipientFingerprint)},${q(input.fingerprint)},${q(input.envelope)},${q(input.tokenHash)},${q(x.locale)});`;
const authSql = (c, x) =>
  `SELECT public.ls_notification_authorize_resend_payload(${q(c.jobId)},${q(c.leaseToken)},${q(x.recipient)},${q(x.recipientFingerprint)});`;
const consumeSql = (s) =>
  `SELECT public.ls_notification_consume_unsubscribe_token(${q(s.token_hash)});`;
async function warm(c) {
  const store = makeStore();
  await runtime.worker.dispatchResendReminders(
    { ...store, claim: async () => [c], authorize: async () => ({ authorized: false }) },
    transport(),
    config,
  );
  return snapshot(c.jobId);
}
async function recoverySnapshot(job) {
  return observer.json(`SELECT json_build_object(
  'job',j.status,'attempts',j.attempt_count,'leaseToken',j.lease_token,'leaseUntil',j.lease_until,
  'cancelled',j.cancel_requested_at IS NOT NULL,
  'consent',(SELECT study_email_enabled FROM public.study_notification_preferences WHERE user_id=j.user_id),
  'deliveries',(SELECT count(*) FROM public.study_notification_deliveries WHERE job_id=j.id),
  'deliveryId',d.id,'delivery',d.status,'errorCode',d.error_code,'messageId',d.provider_message_id,
  'nextAttemptAt',j.next_attempt_at)
 FROM public.study_notification_jobs j
 LEFT JOIN public.study_notification_deliveries d ON d.job_id=j.id AND d.attempt_number=j.attempt_count
 WHERE j.id=${q(job)};`);
}

async function runCrashRecovery() {
  const dispatch = (store = makeStore()) =>
    runtime.worker.dispatchResendReminders(store, transport(), config, { batchSize: 1 });
  const reconcile = () =>
    observer.json("SELECT public.ls_notification_reconcile_expired_leases(25);");
  const scenarios = [
    { name: "CR-01", beforeDelivery: null, afterJob: "pending" },
    { name: "CR-02", beforeDelivery: "submitting", afterJob: "failed" },
    { name: "CR-03", beforeDelivery: "submitting", afterJob: "failed" },
    { name: "CR-04", beforeDelivery: "uncertain", afterJob: "failed" },
    { name: "CR-01 opt-out", beforeDelivery: null, afterJob: "suppressed" },
  ];

  for (const scenario of scenarios) {
    const { name, beforeDelivery, afterJob } = scenario;
    const f = await fixture();
    const store = makeStore();
    calls = [];
    sdkCalls = 0;
    let recordSqlstate = null;
    if (name === "CR-03") {
      const result = await dispatch({
        ...store,
        record: async (claim, deliveryId, fingerprint, outcome) => {
          assert.equal(outcome.kind, "accepted");
          await b.begin("service_role");
          try {
            await b.ok(`SELECT public.ls_notification_record_resend_outcome(
      ${q(deliveryId)},${q(claim.leaseToken)},${q(fingerprint)},'accepted',${q(outcome.providerMessageId)});`);
            const failure = await b.exec("SELECT 1/0;");
            recordSqlstate = failure.state;
            assert.equal(recordSqlstate, "22012");
            throw new Error("Injected failure before outcome commit");
          } finally {
            await b.ok("ROLLBACK;");
          }
        },
      });
      assert.equal(result.held, 1);
      assert.equal(recordSqlstate, "22012");
    } else {
      const c = await claim(f);
      if (beforeDelivery || name === "CR-01 opt-out") {
        const payload = await warm(c);
        assert(payload);
        if (name === "CR-01 opt-out") {
          assert.equal(await observer.ok(consumeSql(payload)), "t");
        } else {
          const context = runtime.resolver.resolveReminderContext(
            await store.resolve(f.job, c.leaseToken),
            config.allowlist,
            config.identityKey,
          );
          assert(context.success);
          const handoff = await store.authorize(c, context.context);
          assert.equal(handoff.authorized, true);
          assert(handoff.deliveryId);
          if (name === "CR-04") {
            await observer.ok(`UPDATE public.study_notification_deliveries SET status='uncertain',error_code='transport_error'
       WHERE id=${q(handoff.deliveryId)};`);
          }
        }
      }
    }

    const before = await recoverySnapshot(f.job);
    assert.equal(before.job, "leased");
    assert.equal(before.attempts, 1);
    assert(before.leaseToken && before.leaseUntil);
    assert.equal(before.delivery, beforeDelivery);
    assert.equal(before.deliveries, beforeDelivery ? 1 : 0);
    assert.equal(before.messageId, null);
    assert.equal(before.consent, name !== "CR-01 opt-out");
    assert.equal(sdkCalls, name === "CR-03" ? 1 : 0);
    const sdkCallsBeforeRecovery = sdkCalls;
    await observer.ok(`UPDATE public.study_notification_jobs SET lease_until=clock_timestamp()-interval '1 second'
   WHERE id=${q(f.job)} AND user_id=${q(owner)} AND status='leased';`);
    const reconciled = await reconcile();
    assert.equal(reconciled, 1);
    const after = await recoverySnapshot(f.job);
    assert.equal(after.job, afterJob);
    assert.equal(after.attempts, before.attempts);
    assert.equal(after.leaseToken, null);
    assert.equal(after.leaseUntil, null);
    assert.equal(after.deliveries, before.deliveries);
    assert.equal(after.deliveryId, before.deliveryId);
    assert.equal(after.delivery, beforeDelivery ? "uncertain" : null);
    assert.equal(
      after.errorCode,
      name === "CR-04" ? "transport_error" : beforeDelivery ? "lease_expired_after_handoff" : null,
    );
    assert.equal(after.messageId, null);
    assert.equal(after.consent, before.consent);
    assert.equal(after.cancelled, name === "CR-01 opt-out");
    const replayReconciled = await reconcile();
    assert.equal(replayReconciled, 0); // CR-05
    assert.deepEqual(await recoverySnapshot(f.job), after);

    const nextWorker = makeStore();
    const observedClaims = [];
    const worker = await dispatch({
      ...nextWorker,
      claim: async (size) => {
        const claims = await nextWorker.claim(size);
        observedClaims.push(...claims);
        return claims;
      },
    });
    if (afterJob === "pending") {
      assert.equal(observedClaims.length, 1);
      assert.equal(observedClaims[0].jobId, f.job);
      assert.notEqual(observedClaims[0].leaseToken, before.leaseToken);
      assert.equal(worker.accepted, 1);
      assert.equal(sdkCalls, 1);
    } else {
      assert.deepEqual(observedClaims, []); // CR-06
      assert.equal(worker.inspected, 0);
      assert.equal(sdkCalls, sdkCallsBeforeRecovery);
      assert.deepEqual(await recoverySnapshot(f.job), after);
    }
    const finalState = await recoverySnapshot(f.job);
    if (afterJob === "pending") {
      assert.equal(finalState.job, "sent");
      assert.equal(finalState.attempts, 2);
      assert.equal(finalState.deliveries, 1);
      assert.equal(finalState.delivery, "accepted");
      assert(finalState.messageId);
    }
    report.runs.push({
      case: name,
      before,
      after,
      final: finalState,
      recordSqlstate,
      reconciled,
      replayReconciled,
      sdkCallsBeforeRecovery,
      sdkCalls,
      workerClaims: observedClaims.length,
    });
  }
}

async function runMultiworker() {
  const store = makeStore();
  const dispatch = (ports = store, mode = "accepted", callback) =>
    runtime.worker.dispatchResendReminders(ports, transport(mode, callback), config, {
      batchSize: 1,
    });
  const claimSql = "SELECT public.ls_notification_claim_batch(1);";
  const reconcileSql = "SELECT public.ls_notification_reconcile_expired_leases(25);";
  const expire = (job) =>
    observer.ok(`UPDATE public.study_notification_jobs SET lease_until=clock_timestamp()-interval '1 second'
  WHERE id=${q(job)} AND user_id=${q(owner)} AND status='leased';`);
  const prepare = async (f) => {
    const c = await claim(f);
    const payload = await warm(c);
    const context = runtime.resolver.resolveReminderContext(
      await store.resolve(f.job, c.leaseToken),
      config.allowlist,
      config.identityKey,
    );
    assert(context.success);
    return { c, payload, authorize: authSql(c, context.context) };
  };
  const recordSql = (id, c, payload, outcome, message = null) =>
    `SELECT public.ls_notification_record_resend_outcome(${q(id)},${q(c.leaseToken)},
   ${q(payload.payload_fingerprint)},${q(outcome)},${message ? q(message) : "NULL"});`;
  const outcome = async (first, second) => {
    await a.begin("service_role");
    await b.begin("service_role");
    const winner = await a.exec(first);
    assert.equal(winner.state, "00000", winner.message);
    const start = Date.now();
    const pending = b.exec(second);
    const blocker = await blocked(b, a);
    await a.ok("COMMIT;");
    const loser = await pending;
    await b.ok(loser.state === "00000" ? "COMMIT;" : "ROLLBACK;");
    return { winner, loser, blocker, waitMs: Date.now() - start };
  };
  const prompt = async (sql) => {
    const start = Date.now();
    const value = await b.json(sql);
    const elapsedMs = Date.now() - start;
    assert(elapsedMs < 2000, `Expected prompt result, observed ${elapsedMs}ms`);
    return { value, elapsedMs };
  };
  const cases = [
    [
      "CC-01 claim",
      async (f) => {
        await a.begin("service_role");
        const leases = await a.json(claimSql);
        assert.equal(leases.length, 1);
        assert.equal(leases[0].jobId, f.job);
        const skipped = await prompt(claimSql);
        assert.deepEqual(skipped.value, []);
        await a.ok("COMMIT;");
        assert.equal((await recoverySnapshot(f.job)).leaseToken, leases[0].leaseToken);
        assert.equal((await dispatch({ ...store, claim: async () => leases })).accepted, 1);
        assert.deepEqual(await store.claim(1), []);
        return { leases: 1, elapsedMs: skipped.elapsedMs, expected: ["sent", "accepted", 1, 1, 1] };
      },
    ],
    [
      "CC-02 authorize",
      async (f) => {
        const { c, authorize } = await prepare(f);
        const race = await outcome(authorize, authorize);
        const winner = JSON.parse(race.winner.text);
        assert.equal(winner.authorized, true);
        assert.equal(race.loser.state, "00000");
        assert.equal(JSON.parse(race.loser.text).reason, "handoff_already_started");
        assert.equal(
          (await dispatch({ ...store, claim: async () => [c], authorize: async () => winner }))
            .accepted,
          1,
        );
        return { ...race, leases: 1, expected: ["sent", "accepted", 1, 1, 1] };
      },
    ],
    ...[false, true].map((expired) => [
      `CC-03 ${expired ? "expired" : "active"} submission`,
      async (f) => {
        const entered = deferred(),
          release = deferred();
        const inFlight = dispatch(store, "accepted", async () => {
          entered.resolve();
          await deadline(release.promise);
        });
        await deadline(entered.promise);
        let reconciled;
        try {
          assert.equal((await recoverySnapshot(f.job)).delivery, "submitting");
          if (expired) await expire(f.job);
          reconciled = await b.json(reconcileSql);
          assert.equal(reconciled, expired ? 1 : 0);
          assert.deepEqual(await b.json(claimSql), []);
          assert.equal(
            (await recoverySnapshot(f.job)).delivery,
            expired ? "uncertain" : "submitting",
          );
          assert.equal(sdkCalls, 1);
        } finally {
          release.resolve();
          assert.equal((await inFlight).accepted, 1);
        }
        assert.equal(await b.json(reconcileSql), 0);
        return { leases: 1, reconciled, expected: ["sent", "accepted", 1, 1, 1] };
      },
    ]),
    [
      "CC-03 outcome first",
      async (f) => {
        let skipped;
        const worker = await dispatch({
          ...store,
          record: async (c, id, fingerprint, submission) => {
            assert.equal(submission.kind, "accepted");
            await expire(f.job);
            await a.begin("service_role");
            await a.ok(
              recordSql(
                id,
                c,
                { payload_fingerprint: fingerprint },
                "accepted",
                submission.providerMessageId,
              ),
            );
            assert.equal((await recoverySnapshot(f.job)).delivery, "submitting");
            skipped = await prompt(reconcileSql);
            assert.equal(skipped.value, 0);
            await a.ok("COMMIT;");
          },
        });
        assert.equal(worker.accepted, 1);
        assert.equal(await b.json(reconcileSql), 0);
        assert.deepEqual(await b.json(claimSql), []);
        return {
          leases: 1,
          elapsedMs: skipped.elapsedMs,
          reconciled: 0,
          expected: ["sent", "accepted", 1, 1, 1],
        };
      },
    ],
    [
      "CC-04 rate-limit and retry claim",
      async (f) => {
        let duringRecord;
        const result = await dispatch(
          {
            ...store,
            record: async (c, id, fingerprint, submission) => {
              assert.deepEqual(submission, {
                kind: "rejected",
                code: "rate_limited",
                retryable: true,
              });
              await a.begin("service_role");
              await a.ok(
                `SELECT public.ls_notification_record_resend_rate_limit(${q(id)},${q(c.leaseToken)},${q(fingerprint)});`,
              );
              duringRecord = await prompt(claimSql);
              assert.deepEqual(duringRecord.value, []);
              await a.ok("COMMIT;");
            },
          },
          "429",
        );
        assert.equal(result.rejected, 1);
        const backoff = await recoverySnapshot(f.job);
        assert.equal(backoff.job, "pending");
        assert.equal(backoff.delivery, "failed");
        assert.equal(backoff.errorCode, "rate_limited");
        assert.equal(backoff.attempts, 1);
        assert.deepEqual(await store.claim(1), []);
        await observer.ok(`UPDATE public.study_notification_jobs SET next_attempt_at=clock_timestamp()-interval '1 second'
    WHERE id=${q(f.job)} AND user_id=${q(owner)};`);
        await a.begin("service_role");
        const leases = await a.json(claimSql);
        assert.equal(leases.length, 1);
        assert.equal(leases[0].jobId, f.job);
        const skipped = await prompt(claimSql);
        assert.deepEqual(skipped.value, []);
        await a.ok("COMMIT;");
        assert.equal((await dispatch({ ...store, claim: async () => leases })).accepted, 1);
        assert.equal(calls.length, 2);
        assert.deepEqual(calls[1], calls[0]);
        assert.deepEqual(await store.claim(1), []);
        return {
          leases: 2,
          elapsedMs: skipped.elapsedMs,
          recordOverlapMs: duringRecord.elapsedMs,
          expected: ["sent", "accepted", 2, 2, 2],
        };
      },
    ],
    ...[true, false].map((optOutFirst) => [
      `CC-05 ${optOutFirst ? "unsubscribe" : "authorize"} first`,
      async (f) => {
        const { c, payload, authorize } = await prepare(f);
        const consume = consumeSql(payload);
        const race = optOutFirst
          ? await outcome(consume, authorize)
          : await outcome(authorize, consume);
        assert.equal(race.loser.state, "00000");
        const decision = JSON.parse(optOutFirst ? race.loser.text : race.winner.text);
        assert.equal(decision.authorized, !optOutFirst);
        assert.equal(optOutFirst ? race.winner.text : race.loser.text, "t");
        // A committed handoff may finish, even when opt-out commits before the outcome.
        if (!optOutFirst) {
          const email = runtime.payload.decryptReminderPayload(payload, config.encryptionKey);
          const result = await transport().send(email);
          assert.equal(result.kind, "accepted");
          await store.record(c, decision.deliveryId, payload.payload_fingerprint, result);
        } else {
          await expire(f.job);
          assert.equal(await b.json(reconcileSql), 1);
        }
        const state = await recoverySnapshot(f.job);
        assert.equal(state.consent, false);
        assert.equal(state.cancelled, true);
        assert.deepEqual(await store.claim(1), []);
        return {
          ...race,
          leases: 1,
          expected: optOutFirst ? ["suppressed", null, 1, 0, 0] : ["sent", "accepted", 1, 1, 1],
        };
      },
    ]),
    ...[true, false].map((acceptedFirst) => [
      `CC-06 ${acceptedFirst ? "accepted" : "rejected"} first`,
      async (f) => {
        const { c, payload, authorize } = await prepare(f);
        const decision = await a.json(authorize);
        assert.equal(decision.authorized, true);
        const accepted = recordSql(decision.deliveryId, c, payload, "accepted", randomUUID());
        const rejected = recordSql(decision.deliveryId, c, payload, "rejected");
        const [first, second] = acceptedFirst ? [accepted, rejected] : [rejected, accepted];
        const race = await outcome(first, second);
        assert.equal(race.loser.state, "22023");
        assert.equal(race.loser.message, "Outcome replay mismatch");
        const beforeReplay = await recoverySnapshot(f.job);
        assert.equal((await a.json(first)).replay, true);
        assert.deepEqual(await recoverySnapshot(f.job), beforeReplay);
        return {
          ...race,
          leases: 1,
          expected: acceptedFirst ? ["sent", "accepted", 1, 1, 0] : ["failed", "failed", 1, 1, 0],
        };
      },
    ]),
    ...[true, false].map((optOutFirst) => [
      `CC-07 ${optOutFirst ? "unsubscribe" : "reconcile"} first`,
      async (f) => {
        const c = await claim(f);
        const payload = await warm(c);
        await expire(f.job);
        let metrics;
        if (optOutFirst) {
          await a.begin("service_role");
          assert.equal(await a.ok(consumeSql(payload)), "t");
          const skipped = await prompt(reconcileSql);
          assert.equal(skipped.value, 0);
          await a.ok("COMMIT;");
          assert.equal(await b.json(reconcileSql), 1);
          metrics = { elapsedMs: skipped.elapsedMs };
        } else {
          const race = await outcome(reconcileSql, consumeSql(payload));
          assert.equal(race.winner.text, "1");
          assert.equal(race.loser.state, "00000");
          assert.equal(race.loser.text, "t");
          metrics = race;
        }
        assert.equal(await b.json(reconcileSql), 0);
        assert.deepEqual(await store.claim(1), []);
        assert.equal((await recoverySnapshot(f.job)).consent, false);
        return { ...metrics, leases: 1, expected: ["suppressed", null, 1, 0, 0] };
      },
    ]),
    [
      "CC-08 independent owners",
      async (f) => {
        const second = await fixture("en", secondOwner);
        await a.begin("service_role");
        await a.ok(`SELECT public.ls_notification_lock_owner(${q(owner)});`);
        const claimed = await prompt(claimSql);
        assert.equal(claimed.value.length, 1);
        assert.equal(claimed.value[0].jobId, second.job);
        assert.equal((await recoverySnapshot(f.job)).job, "pending");
        const both = {
          ...config,
          allowlist: runtime.resolver.configuredReminderRecipients(`${email},${secondEmail}`),
        };
        const worker = await runtime.worker.dispatchResendReminders(
          { ...store, claim: async () => claimed.value },
          transport(),
          both,
          { batchSize: 1 },
        );
        assert.equal(worker.accepted, 1);
        await a.ok("COMMIT;");
        const secondFinal = await recoverySnapshot(second.job);
        assert.equal(secondFinal.job, "sent");
        assert.equal(secondFinal.deliveries, 1);
        assert.equal(secondFinal.attempts, 1);
        assert.equal(secondFinal.delivery, "accepted");
        return {
          leases: 1,
          elapsedMs: claimed.elapsedMs,
          secondFinal,
          expected: ["pending", null, 0, 0, 1],
        };
      },
    ],
  ];

  for (const [name, run] of cases) {
    for (let repeat = 1; repeat <= 3; repeat++) {
      const f = await fixture();
      calls = [];
      sdkCalls = 0;
      const { expected, winner, loser, ...metrics } = await run(f);
      const state = await recoverySnapshot(f.job);
      assert.deepEqual(
        [state.job, state.delivery, state.attempts, state.deliveries, sdkCalls],
        expected,
        name,
      );
      report.runs.push({
        case: name,
        repeat,
        ...metrics,
        sqlstates: [winner?.state ?? "00000", loser?.state ?? "00000"],
        sdkCalls,
        final: state,
      });
    }
  }
}

let fixtureOwnerCreated = false;
try {
  for (const c of [a, b, observer]) await c.init();
  assert.equal(await observer.ok("SELECT count(*) FROM auth.users;"), "0");
  assert.equal(
    await observer.ok("SELECT enabled FROM public.study_notification_dispatch_control;"),
    "f",
  );
  assert.equal(await observer.ok("SELECT enabled FROM public.ls_missed_sweep_control;"), "f");
  if (isolated)
    assert.equal(
      await observer.ok("SELECT count(*) FROM cron.job WHERE jobname ILIKE '%remind%';"),
      "0",
    );
  await observer.ok(
    `INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${q(owner)},${q(email)},clock_timestamp());`,
  );
  fixtureOwnerCreated = true;
  await observer.ok("UPDATE public.study_notification_dispatch_control SET enabled=true;");
  for (const type of [
    "flag-off",
    "gate-off",
    "allowlist",
    "unverified",
    "unconfirmed-locale",
    "suppression",
    "dry-run",
    "en",
    "vi",
    "timeout",
    "409",
  ]) {
    const f = await fixture(type === "vi" ? "vi" : "en");
    calls = [];
    let cfg = { ...config },
      options = {};
    if (type === "flag-off") cfg.enabled = false;
    if (type === "gate-off")
      await observer.ok("UPDATE public.study_notification_dispatch_control SET enabled=false;");
    if (type === "allowlist") cfg.allowlist = new Set(["different@example.invalid"]);
    if (type === "unverified")
      await observer.ok(`UPDATE auth.users SET email_confirmed_at=NULL WHERE id=${q(owner)};`);
    if (type === "unconfirmed-locale")
      await observer.ok(
        `UPDATE public.study_notification_preferences SET reminder_locale=NULL,locale_confirmed_at=NULL WHERE user_id=${q(owner)};`,
      );
    if (type === "suppression") {
      const resolved = runtime.resolver.resolveReminderContext(
        await makeStore().resolve(f.job),
        config.allowlist,
        config.identityKey,
      );
      assert(resolved.success);
      await observer.ok(`SELECT public.ls_notification_issue_unsubscribe_token(${q(owner)},${q(email)},${q(resolved.context.recipientFingerprint)},${q(randomBytes(32).toString("hex"))});
   INSERT INTO public.study_notification_suppressions(user_id,recipient_fingerprint,reason) VALUES(${q(owner)},${q(resolved.context.recipientFingerprint)},'manual_block');`);
    }
    if (type === "dry-run") {
      options = { dryRun: true };
      cfg.enabled = false;
    }
    const counts = await runtime.worker.dispatchResendReminders(
      makeStore(),
      transport(type === "timeout" ? "timeout" : type === "409" ? "409" : "accepted"),
      cfg,
      options,
    );
    const state = await final(f.job),
      shouldSend = ["en", "vi", "timeout", "409"].includes(type);
    assert.equal(calls.length, shouldSend ? 1 : 0);
    if (shouldSend) {
      const s = await snapshot(f.job);
      assert.equal(calls[0].fingerprint, s.payload_fingerprint);
      assert.equal(calls[0].key, f.job);
      assert.equal(s.locale, type === "vi" ? "vi" : "en");
    }
    if (type === "timeout" || type === "409") {
      assert.equal(state.delivery, "uncertain");
      assert.equal(state.job, "failed");
      assert.deepEqual(await makeStore().claim(1), []);
    }
    report.runs.push({ case: type, counts, mockSubmissions: calls.length, final: state });
    await observer.ok("UPDATE public.study_notification_dispatch_control SET enabled=true;");
  }
  for (let repeat = 1; repeat <= 3; repeat++) {
    // RI-08: two transactions prepare distinct candidates; both actual workers
    // must decrypt the FIRST committed envelope/capability. A uses another TZ.
    let f = await fixture();
    let c = await claim(f);
    calls = [];
    const prepared = deferred(),
      release = deferred();
    const storeA = makeStore(),
      storeB = makeStore();
    let snapA, snapB;
    const wa = runtime.worker.dispatchResendReminders(
      {
        ...storeA,
        claim: async () => [c],
        prepare: async (claim, context, input) => {
          await a.begin("service_role");
          await a.ok("SET LOCAL TIME ZONE 'Asia/Ho_Chi_Minh';");
          snapA = await a.json(prepareSql(claim, context, input));
          prepared.resolve();
          await deadline(release.promise);
          await a.ok("COMMIT;");
          return snapA;
        },
        authorize: async () => ({ authorized: false }),
      },
      transport(),
      config,
    );
    await deadline(prepared.promise);
    const wb = runtime.worker.dispatchResendReminders(
      {
        ...storeB,
        claim: async () => [c],
        prepare: async (claim, context, input) => {
          await b.begin("service_role");
          snapB = await b.json(prepareSql(claim, context, input));
          await b.ok("COMMIT;");
          return snapB;
        },
        authorize: async () => ({ authorized: false }),
      },
      transport(),
      config,
    );
    const blocker = await blocked(b, a);
    release.resolve();
    await Promise.all([wa, wb]);
    assert.equal(snapA.encrypted_payload, snapB.encrypted_payload);
    assert.equal(snapA.payload_fingerprint, snapB.payload_fingerprint);
    assert.equal(
      await observer.ok(
        `SELECT count(*) FROM public.study_notification_unsubscribe_tokens WHERE user_id=${q(owner)};`,
      ),
      "1",
    );
    await runtime.worker.dispatchResendReminders(
      { ...makeStore(), claim: async () => [c] },
      transport(),
      config,
    );
    assert.equal(calls.length, 1);
    report.runs.push({
      case: "RI-08",
      repeat,
      blocker,
      immutablePayload: true,
      mockSubmissions: calls.length,
      final: await final(f.job),
    });
    // RI-12: unsubscribe A holds coordinator while actual worker B authorizes.
    f = await fixture();
    c = await claim(f);
    calls = [];
    const s = await warm(c);
    await a.begin("service_role");
    await a.ok(consumeSql(s));
    const before = runtime.worker.dispatchResendReminders(
      {
        ...makeStore(),
        claim: async () => [c],
        authorize: async (claim, x) => {
          await b.begin("service_role");
          const result = await b.json(authSql(claim, x));
          await b.ok("COMMIT;");
          return result;
        },
      },
      transport(),
      config,
    );
    const beforeBlocker = await blocked(b, a);
    await a.ok("COMMIT;");
    await before;
    assert.equal(calls.length, 0);
    report.runs.push({
      case: "RI-12",
      repeat,
      blocker: beforeBlocker,
      mockSubmissions: 0,
      final: await final(f.job),
    });
    // RI-13: provider port waits outside any DB transaction. Opt-out A commits
    // while accepted outcome B is blocked; real outcome survives the fence.
    f = await fixture();
    calls = [];
    const entered = deferred(),
      respond = deferred();
    const after = runtime.worker.dispatchResendReminders(
      {
        ...makeStore(),
        record: async (claim, id, fp, result) => {
          await b.begin("service_role");
          await b.ok(
            `SELECT public.ls_notification_record_resend_outcome(${q(id)},${q(claim.leaseToken)},${q(fp)},'accepted',${q(result.providerMessageId)});`,
          );
          await b.ok("COMMIT;");
        },
      },
      transport("accepted", async () => {
        entered.resolve();
        await deadline(respond.promise);
      }),
      config,
    );
    await deadline(entered.promise);
    const afterSnapshot = await snapshot(f.job);
    await a.begin("service_role");
    await a.ok(consumeSql(afterSnapshot));
    respond.resolve();
    const afterBlocker = await blocked(b, a);
    await a.ok("COMMIT;");
    await after;
    const afterState = await final(f.job);
    assert.equal(afterState.job, "sent");
    assert.equal(afterState.cancelled, true);
    assert.equal(afterState.consent, false);
    assert.equal(calls.length, 1);
    report.runs.push({
      case: "RI-13",
      repeat,
      blocker: afterBlocker,
      mockSubmissions: 1,
      final: afterState,
    });
    // RI-14: worker A's uncommitted claim holds owner; worker B really SKIPs it.
    // claim() resolves only after COMMIT, as required by the production port.
    f = await fixture();
    calls = [];
    const claimed = deferred(),
      commit = deferred();
    const first = runtime.worker.dispatchResendReminders(
      {
        ...makeStore(),
        claim: async (size) => {
          await a.begin("service_role");
          const result = await a.json(`SELECT public.ls_notification_claim_batch(${size});`);
          claimed.resolve();
          await deadline(commit.promise);
          await a.ok("COMMIT;");
          return result;
        },
      },
      transport(),
      config,
    );
    await deadline(claimed.promise);
    const start = Date.now();
    await runtime.worker.dispatchResendReminders(
      {
        ...makeStore(),
        claim: async (size) => {
          await b.begin("service_role");
          const result = await b.json(`SELECT public.ls_notification_claim_batch(${size});`);
          await b.ok("COMMIT;");
          return result;
        },
      },
      transport(),
      config,
    );
    const elapsedMs = Date.now() - start;
    assert(elapsedMs < 2000);
    assert.equal(calls.length, 0);
    commit.resolve();
    await first;
    assert.equal(calls.length, 1);
    report.runs.push({
      case: "RI-14",
      repeat,
      skipElapsedMs: elapsedMs,
      mockSubmissions: 1,
      final: await final(f.job),
    });
  }
  if (crashRecovery) await runCrashRecovery();
  if (multiworker) {
    await observer.ok(`INSERT INTO auth.users(id,email,email_confirmed_at)
   VALUES(${q(secondOwner)},${q(secondEmail)},clock_timestamp());`);
    await runMultiworker();
  }
} finally {
  for (const c of [a, b]) {
    try {
      await c.ok("ROLLBACK;");
    } catch {}
  }
  try {
    if (fixtureOwnerCreated)
      await observer.ok(`UPDATE public.study_notification_dispatch_control SET enabled=false;
   DELETE FROM public.study_notification_suppressions WHERE user_id=${q(owner)};
   DELETE FROM public.tasks WHERE user_id IN (${q(owner)},${q(secondOwner)}) AND title='8D fixture';
   DELETE FROM auth.users WHERE id IN (${q(owner)},${q(secondOwner)});`);
    report.finalCounts = await observer.json(
      `SELECT json_build_object('users',(SELECT count(*) FROM auth.users),'tasks',(SELECT count(*) FROM public.tasks),'jobs',(SELECT count(*) FROM public.study_notification_jobs),'deliveries',(SELECT count(*) FROM public.study_notification_deliveries),'payloads',(SELECT count(*) FROM public.study_notification_resend_payloads),'tokens',(SELECT count(*) FROM public.study_notification_unsubscribe_tokens),'identities',(SELECT count(*) FROM public.study_notification_recipient_identities),'suppressions',(SELECT count(*) FROM public.study_notification_suppressions));`,
    );
    assert(Object.values(report.finalCounts).every((x) => x === 0));
    report.cleanup = true;
    report.gates = await observer.json(
      `SELECT json_build_object('dispatch',(SELECT enabled FROM public.study_notification_dispatch_control),'sweep',(SELECT enabled FROM public.ls_missed_sweep_control),'reminderCron',(SELECT count(*) FROM cron.job WHERE jobname ILIKE '%remind%'));`,
    );
    assert.deepEqual(report.gates, { dispatch: false, sweep: false, reminderCron: 0 });
  } finally {
    for (const c of [a, b, observer]) await c.close();
  }
  report.completedAt = new Date().toISOString();
  if (!isolated)
    await writeFile(
      resolve(root, "docs/learning-schedule/phase-08-resend-worker.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
}
console.log(
  `PASS: actual worker/adapter ${report.runs.length} executions; ${report.runs.filter((x) => x.blocker).length} observed blockers; no real provider requests; clean/OFF`,
);
if (isolated) {
  for (const run of report.runs.filter((entry) =>
    entry.case.startsWith(multiworker ? "CC-" : "CR-"),
  ))
    console.log(JSON.stringify(run));
  console.log(
    JSON.stringify({
      baseline: report.baseline,
      finalCounts: report.finalCounts,
      gates: report.gates,
    }),
  );
}
