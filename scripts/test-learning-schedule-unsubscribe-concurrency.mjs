import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const includeReconsent = process.argv.includes("--reconsent");
const container = includeReconsent ? "supabase_db_lumivox-11c4e" : "supabase_db_lumivox-proj";
const owner = randomUUID();
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
// LOCAL ONLY. Temporarily enables the DB gate for fixture authorization. Never
// calls a provider, creates Cron or reads a live API key. Restores OFF in finally.
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

const [a, b, observer] = ["8c-A", "8c-B", "8c-observer"].map((name) => new Connection(name));
const fp = "a".repeat(64),
  payload = "b".repeat(64),
  email = "unsubscribe-cc@example.invalid";
const report = {
  baseline: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  startedAt: new Date().toISOString(),
  runs: [],
  providerRequests: 0,
  cleanup: false,
};
const receiptIds = [];
async function fixture() {
  const task = randomUUID(),
    schedule = randomUUID(),
    session = randomUUID(),
    job = randomUUID(),
    hash = randomBytes(32).toString("hex");
  await observer.ok(`DO $fixture$ DECLARE st timestamptz:=date_trunc('milliseconds',clock_timestamp())+interval '5 minutes';z text;day date;BEGIN
 z:=CASE WHEN extract(hour FROM clock_timestamp() AT TIME ZONE 'UTC') BETWEEN 2 AND 20 THEN 'UTC' ELSE 'Etc/GMT+12' END;day:=(st AT TIME ZONE z)::date;
 INSERT INTO public.tasks(id,user_id,title,status) VALUES(${q(task)},${q(owner)},'8C fixture','todo');
 INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone) VALUES(${q(schedule)},${q(owner)},${q(task)},day,day,z);
 INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
 VALUES(${q(session)},${q(owner)},${q(task)},${q(schedule)},1,${q(session)},day,(st AT TIME ZONE z)::time,((st+interval '30 minutes') AT TIME ZONE z)::time,z,st,st+interval '30 minutes');
 INSERT INTO public.study_notification_jobs(id,user_id,session_id,schedule_revision,due_at,next_attempt_at,idempotency_key,lifecycle_fingerprint)
 SELECT ${q(job)},user_id,${q(session)},1,due_at,due_at,${q(job)},fingerprint FROM public.ls_notification_session_policy(${q(session)});
 END $fixture$;
 SELECT public.ls_notification_issue_unsubscribe_token(${q(owner)},${q(email)},${q(fp)},${q(hash)});`);
  return { task, job, hash, token: null };
}
const consume = (f) => `SELECT public.ls_notification_consume_unsubscribe_token(${q(f.hash)});`;
const auth = (f) =>
  `SELECT public.ls_notification_authorize_resend_attempt(${q(f.job)},${q(f.token)},${q(email)},${q(fp)},${q(payload)},'en',true);`;
async function claim(connection, f) {
  const claims = await connection.json("SELECT public.ls_notification_claim_batch();");
  const match = claims.find((x) => x.jobId === f.job);
  assert(match, "Fixture was not claimed");
  f.token = match.leaseToken;
}
async function blocked(waiter, blocker) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const pids = await observer.json(`SELECT to_json(pg_blocking_pids(${waiter.pid}));`);
    if (pids.includes(blocker.pid))
      return { waiter: waiter.pid, blocker: blocker.pid, observed: pids };
    await wait(20);
  }
  throw new Error("Expected owner blocker not observed");
}
async function finishPending(pending) {
  const result = await pending;
  assert.equal(result.state, "00000");
  await b.ok("COMMIT;");
  return result;
}
async function resetFixtures() {
  await observer.ok(`DELETE FROM public.study_notification_suppressions WHERE user_id=${q(owner)};
 DELETE FROM public.tasks WHERE user_id=${q(owner)} AND title='8C fixture';
 SELECT set_config('request.jwt.claim.sub',${q(owner)},false); SELECT public.ls_set_study_notification_preferences(true);`);
}
async function snapshot(f) {
  return observer.json(`SELECT json_build_object('consent',(SELECT study_email_enabled FROM public.study_notification_preferences WHERE user_id=${q(owner)}),
 'job',j.status,'cancelled',j.cancel_requested_at IS NOT NULL,
 'deliveries',(SELECT count(*) FROM public.study_notification_deliveries WHERE job_id=j.id),
 'suppressed',(SELECT count(*) FROM public.study_notification_suppressions WHERE user_id=${q(owner)} AND revoked_at IS NULL))
 FROM public.study_notification_jobs j WHERE j.id=${q(f.job)};`);
}
try {
  for (const c of [a, b, observer]) await c.init();
  assert.equal(
    await observer.ok("SELECT current_database()||':'||current_setting('port');"),
    "postgres:5432",
  );
  assert.equal(
    await observer.ok("SELECT count(*) FROM auth.users;"),
    "0",
    "Disposable LOCAL DB must be empty",
  );
  assert.equal(
    await observer.ok("SELECT enabled FROM public.study_notification_dispatch_control;"),
    "f",
  );
  assert.equal(await observer.ok("SELECT enabled FROM public.ls_missed_sweep_control;"), "f");
  await observer.ok(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${q(owner)},${q(email)},clock_timestamp());
 UPDATE public.study_notification_dispatch_control SET enabled=true;`);
  const orders = [
    "unsubscribe-claim",
    "claim-unsubscribe",
    "unsubscribe-handoff",
    "handoff-unsubscribe",
    "settings-unsubscribe",
    "unsubscribe-settings",
    "suppression-handoff",
    "handoff-suppression",
  ];
  for (const order of orders)
    for (let repeat = 1; repeat <= 3; repeat++) {
      await resetFixtures();
      let source;
      if (order.includes("suppression")) {
        source = await fixture();
        await observer.begin("service_role");
        await claim(observer, source);
        const handoff = await observer.json(auth(source));
        assert.equal(handoff.authorized, true);
        source.message = randomUUID();
        await observer.ok(
          `SELECT public.ls_notification_record_resend_outcome(${q(handoff.deliveryId)},${q(source.token)},${q(payload)},'accepted',${q(source.message)});COMMIT;`,
        );
      }
      const f = await fixture();
      if (order.includes("handoff")) {
        await observer.begin("service_role");
        await claim(observer, f);
        await observer.ok("COMMIT;");
      }
      await a.begin(order.startsWith("settings") ? "authenticated" : "service_role");
      await b.begin(order.endsWith("settings") ? "authenticated" : "service_role");
      let blocker = null,
        returned = null,
        elapsedMs = null;
      const preference = "SELECT public.ls_set_study_notification_preferences(true);";
      let event;
      if (source) {
        const id = randomUUID();
        receiptIds.push(id);
        event = `SELECT public.ls_notification_ingest_resend(${q(id)},${q(source.message)},'email.complained',clock_timestamp(),${q(fp)},${q("c".repeat(64))});`;
      }
      if (order === "unsubscribe-claim") {
        await a.ok(consume(f));
        const start = Date.now();
        returned = await b.json("SELECT public.ls_notification_claim_batch();");
        elapsedMs = Date.now() - start;
        assert.deepEqual(returned, []);
        assert(elapsedMs < 2000, "Busy owner claim must skip promptly");
        await b.ok("COMMIT;");
        await a.ok("COMMIT;");
      } else {
        if (order === "claim-unsubscribe") await claim(a, f);
        else if (order === "handoff-unsubscribe" || order === "handoff-suppression") {
          returned = await a.json(auth(f));
          assert.equal(returned.authorized, true);
        } else if (order === "settings-unsubscribe") await a.ok(preference);
        else if (order === "suppression-handoff") await a.ok(event);
        else await a.ok(consume(f));
        const sql = order.endsWith("handoff")
          ? auth(f)
          : order.endsWith("settings")
            ? preference
            : order.endsWith("suppression")
              ? event
              : consume(f);
        const pending = b.exec(sql);
        blocker = await blocked(b, a);
        await a.ok("COMMIT;");
        const result = await finishPending(pending);
        if (order.endsWith("handoff")) {
          returned = JSON.parse(result.text);
          assert.equal(returned.authorized, false);
        }
      }
      let final = await snapshot(f);
      if (order === "unsubscribe-settings")
        assert.equal(final.consent, true, "Explicit later Settings command is allowed to opt in");
      else if (!order.includes("suppression")) assert.equal(final.consent, false);
      if (order === "claim-unsubscribe") {
        await observer.begin("service_role");
        const denial = await observer.json(auth(f));
        assert.equal(denial.authorized, false);
        await observer.ok("COMMIT;");
        final = await snapshot(f);
      }
      if (order.startsWith("handoff")) {
        assert.equal(final.deliveries, 1);
        assert.equal(final.cancelled, true);
      } else assert.equal(final.deliveries, 0);
      if (order.includes("suppression")) {
        assert.equal(final.suppressed, 1);
        assert.equal(final.consent, true, "Suppression does not rewrite consent");
      }
      report.runs.push({ order, repeat, sqlstate: "00000", blocker, elapsedMs, returned, final });
    }
  if (includeReconsent) {
    const setConsent = "SELECT public.ls_set_study_notification_preferences(true);";
    for (const order of ["reconsent-old-token", "old-token-reconsent"]) {
      const reconsentFirst = order === "reconsent-old-token";
      for (let repeat = 1; repeat <= 3; repeat++) {
        await resetFixtures();
        const f = await fixture();
        await a.begin("authenticated");
        await a.ok("SELECT public.ls_set_study_notification_preferences(false);");
        await a.ok("COMMIT;");

        await a.begin(reconsentFirst ? "authenticated" : "service_role");
        await b.begin(reconsentFirst ? "service_role" : "authenticated");
        if (reconsentFirst) await a.ok(setConsent);
        else assert.equal(await a.ok(consume(f)), "t");

        const pending = b.exec(reconsentFirst ? consume(f) : setConsent);
        const blocker = await blocked(b, a);
        await a.ok("COMMIT;");
        const result = await finishPending(pending);
        if (reconsentFirst) assert.equal(result.text, "f");

        const token = await observer.json(`
      SELECT json_build_object('used', used_at IS NOT NULL, 'revoked', revoked_at IS NOT NULL)
      FROM public.study_notification_unsubscribe_tokens WHERE token_hash = ${q(f.hash)};
    `);
        assert.deepEqual(token, { used: !reconsentFirst, revoked: reconsentFirst });
        const final = await snapshot(f);
        assert.equal(final.consent, true);
        assert.equal(final.deliveries, 0);
        report.runs.push({ order, repeat, sqlstate: result.state, blocker, token, final });
      }
    }
  }
} finally {
  for (const c of [a, b]) {
    try {
      await c.ok("ROLLBACK;");
    } catch {}
  }
  try {
    await observer.ok(`UPDATE public.study_notification_dispatch_control SET enabled=false;
   DELETE FROM public.study_notification_suppressions WHERE user_id=${q(owner)};
   DELETE FROM public.study_notification_webhook_receipts WHERE provider_event_id IN (${receiptIds.length ? receiptIds.map(q).join(",") : "''"});
   DELETE FROM public.tasks WHERE user_id=${q(owner)} AND title='8C fixture';DELETE FROM auth.users WHERE id=${q(owner)};`);
    const counts =
      await observer.json(`SELECT json_build_object('users',(SELECT count(*) FROM auth.users),'tasks',(SELECT count(*) FROM public.tasks),
   'jobs',(SELECT count(*) FROM public.study_notification_jobs),'deliveries',(SELECT count(*) FROM public.study_notification_deliveries),
   'tokens',(SELECT count(*) FROM public.study_notification_unsubscribe_tokens),'suppressions',(SELECT count(*) FROM public.study_notification_suppressions),
   'identities',(SELECT count(*) FROM public.study_notification_recipient_identities),'receipts',(SELECT count(*) FROM public.study_notification_webhook_receipts));`);
    assert(Object.values(counts).every((x) => x === 0));
    report.finalCounts = counts;
    report.cleanup = true;
    report.gates = await observer.json(
      `SELECT json_build_object('dispatch',(SELECT enabled FROM public.study_notification_dispatch_control),'sweep',(SELECT enabled FROM public.ls_missed_sweep_control),'reminderCron',(SELECT count(*) FROM cron.job WHERE jobname ILIKE '%remind%'));`,
    );
    assert.deepEqual(report.gates, { dispatch: false, sweep: false, reminderCron: 0 });
  } finally {
    for (const c of [a, b, observer]) await c.close();
  }
  report.completedAt = new Date().toISOString();
  if (!includeReconsent) {
    await writeFile(
      resolve(root, "docs/learning-schedule/phase-08-unsubscribe-concurrency.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  }
}
console.log(
  `PASS: ${report.runs.length} executions; ${report.runs.filter((x) => x.blocker).length} observed blockers; prompt SKIP LOCKED; no provider requests; clean/OFF`,
);
if (includeReconsent) {
  const runs = report.runs.filter((run) => run.token);
  console.log(
    `Re-consent: ${runs.length} executions; SQLSTATE ${[...new Set(runs.map((run) => run.sqlstate))].join(", ")}; ${runs.filter((run) => run.blocker).length} observed blockers`,
  );
}
